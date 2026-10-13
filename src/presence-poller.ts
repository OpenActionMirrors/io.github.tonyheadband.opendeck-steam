import type { AvatarLoader } from "./steam/avatar.js";
import { stateOf, type FriendUpdate, type PresenceState } from "./steam/presence.js";
import { SteamApiError, type SteamApi } from "./steam/web-api.js";

type Listener = (update: FriendUpdate) => void | Promise<void>;

export interface PresencePoller {
  subscribe(id: string, steamId: string | undefined, update: Listener): void;
  unsubscribe(id: string): void;
  setApi(api: Pick<SteamApi, "getSummaries"> | undefined): void;
  latest(steamId: string): FriendUpdate | undefined;
}

export function createPresencePoller(deps: {
  loadAvatar: AvatarLoader;
  logger: { error(...data: unknown[]): void };
  intervalMs?: number;
  debounceMs?: number;
}): PresencePoller {
  const intervalMs = deps.intervalMs ?? 60_000;
  const debounceMs = deps.debounceMs ?? 1_000;

  const subscribers = new Map<string, { steamId: string | undefined; update: Listener }>();
  const latest = new Map<string, FriendUpdate>();
  const lastSent = new Map<string, string>();
  const previousStates = new Map<string, PresenceState>();

  let api: Pick<SteamApi, "getSummaries"> | undefined;
  let authFailed = false;
  let running = false;
  let rerun = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  let pending: ReturnType<typeof setTimeout> | undefined;

  const signature = (update: FriendUpdate): string =>
    update.kind === "view" ? `view|${update.view.state}|${update.view.avatarUrl ?? ""}|${update.view.avatar ? 1 : 0}` : update.kind;

  function deliver(id: string, steamId: string, update: FriendUpdate): void {
    const subscriber = subscribers.get(id);
    const sig = signature(update);
    // The key's friend may have changed while the poll was in flight.
    if (!subscriber || subscriber.steamId !== steamId || lastSent.get(id) === sig) return;

    lastSent.set(id, sig);
    try {
      void Promise.resolve(subscriber.update(update)).catch((error: unknown) => deps.logger.error("Friend key update failed", error));
    } catch (error) {
      deps.logger.error("Friend key update failed", error);
    }
  }

  // `wanted` marks a debounced trigger (a key appeared, a friend or the API changed): if one lands
  // while a poll is running it must not be lost, so it re-runs once afterwards. Interval ticks are not.
  async function poll(wanted = false): Promise<void> {
    if (running) {
      if (wanted) rerun = true;
      return;
    }
    running = true;
    const current = api;
    try {
      const targets = [...subscribers].flatMap(([id, subscriber]) => (subscriber.steamId ? [{ id, steamId: subscriber.steamId }] : []));
      if (targets.length === 0) return;

      if (current === undefined) {
        for (const { id, steamId } of targets) deliver(id, steamId, { kind: "nokey" });
        return;
      }
      if (authFailed) {
        for (const { id, steamId } of targets) deliver(id, steamId, { kind: "auth" });
        return;
      }

      const steamIds = [...new Set(targets.map((target) => target.steamId))];
      let summaries;
      try {
        summaries = await current.getSummaries(steamIds);
      } catch (error) {
        if (api !== current) return;
        if (error instanceof SteamApiError && (error.status === 401 || error.status === 403)) {
          authFailed = true;
          for (const { id, steamId } of targets) deliver(id, steamId, { kind: "auth" });
        }
        deps.logger.error("Presence poll failed", error);
        return;
      }

      if (api !== current) return;

      const bySteamId = new Map(summaries.map((summary) => [summary.steamId, summary]));
      const cameOnline = new Set<string>();
      for (const known of previousStates.keys()) {
        if (!steamIds.includes(known)) previousStates.delete(known);
      }
      for (const steamId of steamIds) {
        const summary = bySteamId.get(steamId);
        if (!summary) {
          previousStates.delete(steamId);
          latest.set(steamId, { kind: "unknown" });
          continue;
        }

        const state = stateOf(summary);
        if (previousStates.get(steamId) === "offline" && state !== "offline") cameOnline.add(steamId);
        previousStates.set(steamId, state);

        const avatar = summary.avatarUrl ? await deps.loadAvatar(summary.avatarUrl) : undefined;
        latest.set(steamId, {
          kind: "view",
          view: { steamId, name: summary.name, state, avatarUrl: summary.avatarUrl, avatar },
        });
      }
      for (const { id, steamId } of targets) {
        const update = latest.get(steamId);
        if (!update) continue;
        deliver(id, steamId, update.kind === "view" && cameOnline.has(steamId) ? { kind: "view", view: { ...update.view, cameOnline: true } } : update);
      }
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        void poll();
      }
    }
  }

  function scheduleSoon(): void {
    if (pending) return;
    pending = setTimeout(() => {
      pending = undefined;
      void poll(true);
    }, debounceMs);
  }

  const hasFriendKeys = () => [...subscribers.values()].some((subscriber) => subscriber.steamId !== undefined);

  // A fresh interval means nobody has polled for a while, so the keys must not wait a full period.
  function ensureInterval(): void {
    if (interval || !hasFriendKeys()) return;
    interval = setInterval(() => void poll(), intervalMs);
    scheduleSoon();
  }

  function stopIfIdle(): void {
    if (hasFriendKeys()) return;
    if (interval) clearInterval(interval);
    if (pending) clearTimeout(pending);
    interval = undefined;
    pending = undefined;
  }

  return {
    subscribe(id, steamId, update) {
      const previous = subscribers.get(id);
      subscribers.set(id, { steamId, update });
      if (previous?.steamId !== steamId) lastSent.delete(id);
      if (steamId === undefined) {
        stopIfIdle();
        return;
      }

      ensureInterval();
      if (previous?.steamId !== steamId || !latest.has(steamId)) scheduleSoon();
    },

    unsubscribe(id) {
      const steamId = subscribers.get(id)?.steamId;
      subscribers.delete(id);
      lastSent.delete(id);
      // A friend nobody watches is not observed, so coming back to them must not look like a transition.
      if (steamId && ![...subscribers.values()].some((subscriber) => subscriber.steamId === steamId)) previousStates.delete(steamId);
      stopIfIdle();
    },

    setApi(next) {
      api = next;
      authFailed = false;
      if (subscribers.size > 0) scheduleSoon();
    },

    latest(steamId) {
      if (api === undefined) return { kind: "nokey" };
      if (authFailed) return { kind: "auth" };
      return latest.get(steamId);
    },
  };
}
