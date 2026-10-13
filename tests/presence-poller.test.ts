import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPresencePoller, type PresencePoller } from "../src/presence-poller.js";
import type { AvatarLoader } from "../src/steam/avatar.js";
import type { PlayerSummary } from "../src/steam/presence.js";
import { SteamApiError } from "../src/steam/web-api.js";

const A = "76561198000000002";
const B = "76561198000000003";
const logger = { error: vi.fn() };

const player = (steamId: string, over: Partial<PlayerSummary> = {}): PlayerSummary => ({
  steamId,
  name: `n-${steamId}`,
  personaState: 1,
  ...over,
});

function summariesFrom(table: Record<string, PlayerSummary>) {
  return vi.fn(async (ids: string[]): Promise<PlayerSummary[]> => ids.flatMap((id) => (table[id] ? [table[id]] : [])));
}

let table: Record<string, PlayerSummary>;
let getSummaries: ReturnType<typeof summariesFrom>;
const avatarLoader = () => vi.fn<AvatarLoader>(async () => undefined);
let loadAvatar: ReturnType<typeof avatarLoader>;
let poller: PresencePoller;

beforeEach(() => {
  vi.useFakeTimers();
  logger.error.mockClear();
  table = { [A]: player(A), [B]: player(B) };
  getSummaries = summariesFrom(table);
  loadAvatar = avatarLoader();
  poller = createPresencePoller({ loadAvatar, logger });
  poller.setApi({ getSummaries });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("polling cadence", () => {
  it("polls once shortly after the first friend key appears", async () => {
    const update = vi.fn();
    poller.subscribe("k1", A, update);

    await vi.advanceTimersByTimeAsync(999);
    expect(getSummaries).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(getSummaries).toHaveBeenCalledExactlyOnceWith([A]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0]).toMatchObject({ kind: "view", view: { steamId: A, state: "online", name: `n-${A}` } });
  });

  it("then polls every 60 seconds", async () => {
    poller.subscribe("k1", A, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(getSummaries).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getSummaries).toHaveBeenCalledTimes(3);
  });

  it("batches every distinct pinned friend into one request", async () => {
    poller.subscribe("k1", A, vi.fn());
    poller.subscribe("k2", A, vi.fn());
    poller.subscribe("k3", B, vi.fn());

    await vi.advanceTimersByTimeAsync(1000);

    expect(getSummaries).toHaveBeenCalledExactlyOnceWith([A, B]);
  });

  it("does nothing for keys with no friend chosen", async () => {
    const update = vi.fn();
    poller.subscribe("k1", undefined, update);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(getSummaries).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("makes no request if the key disappears before the first poll", async () => {
    poller.subscribe("k1", A, vi.fn());
    poller.unsubscribe("k1");
    await vi.advanceTimersByTimeAsync(180_000);
    expect(getSummaries).not.toHaveBeenCalled();
  });

  it("stops polling when the last key is gone", async () => {
    poller.subscribe("k1", A, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    poller.unsubscribe("k1");
    await vi.advanceTimersByTimeAsync(600_000);
    expect(getSummaries).toHaveBeenCalledTimes(1);
  });

  it("polls soon after a key's friend changes", async () => {
    const update = vi.fn();
    poller.subscribe("k1", A, update);
    await vi.advanceTimersByTimeAsync(1000);

    poller.subscribe("k1", B, update);
    await vi.advanceTimersByTimeAsync(999);
    expect(getSummaries).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(getSummaries).toHaveBeenLastCalledWith([B]);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "view", view: expect.objectContaining({ steamId: B }) }));
  });
});

describe("updates", () => {
  it("redraws only when the shown state changes", async () => {
    const update = vi.fn();
    poller.subscribe("k1", A, update);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(update).toHaveBeenCalledTimes(1);

    table[A] = player(A, { personaState: 3 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]?.[0]).toMatchObject({ view: { state: "away" } });
  });

  it("downloads the avatar and includes it in the view", async () => {
    const bytes = Buffer.from("img");
    table[A] = player(A, { avatarUrl: "https://avatars.steamstatic.com/x.jpg" });
    loadAvatar.mockResolvedValue(bytes);
    const update = vi.fn();
    poller.subscribe("k1", A, update);

    await vi.advanceTimersByTimeAsync(1000);

    expect(loadAvatar).toHaveBeenCalledWith("https://avatars.steamstatic.com/x.jpg");
    expect(update.mock.calls[0]?.[0].view.avatar).toBe(bytes);
  });

  it("reports an unknown friend when the API does not return them", async () => {
    delete table[A];
    const update = vi.fn();
    poller.subscribe("k1", A, update);
    await vi.advanceTimersByTimeAsync(1000);
    expect(update).toHaveBeenCalledExactlyOnceWith({ kind: "unknown" });
  });

  it("exposes the latest known state", async () => {
    expect(poller.latest(A)).toBeUndefined();
    poller.subscribe("k1", A, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    expect(poller.latest(A)).toMatchObject({ kind: "view", view: { steamId: A } });
  });

  it("keeps updating other keys when one listener throws", async () => {
    const good = vi.fn();
    poller.subscribe("k1", A, () => {
      throw new Error("boom");
    });
    poller.subscribe("k2", A, good);

    await vi.advanceTimersByTimeAsync(1000);

    expect(good).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });

  it("keeps updating when an async listener rejects", async () => {
    const good = vi.fn();
    poller.subscribe("k1", A, async () => Promise.reject(new Error("boom")));
    poller.subscribe("k2", A, good);
    await vi.advanceTimersByTimeAsync(1000);
    expect(good).toHaveBeenCalledTimes(1);
  });
});

describe("timing races", () => {
  it("re-runs once when a trigger arrives during a running poll", async () => {
    let release: (value: PlayerSummary[]) => void = () => {};
    getSummaries.mockImplementationOnce(() => new Promise<PlayerSummary[]>((resolve) => (release = resolve)));
    const first = vi.fn();
    const second = vi.fn();
    poller.subscribe("k1", A, first);
    await vi.advanceTimersByTimeAsync(1000);

    poller.subscribe("k2", B, second);
    await vi.advanceTimersByTimeAsync(1000);
    expect(getSummaries).toHaveBeenCalledTimes(1);

    release([player(A)]);
    await vi.advanceTimersByTimeAsync(0);

    expect(getSummaries).toHaveBeenCalledTimes(2);
    expect(getSummaries).toHaveBeenLastCalledWith([A, B]);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale auth error from a key that was replaced mid-poll", async () => {
    let fail: (error: Error) => void = () => {};
    const stale = vi.fn(() => new Promise<PlayerSummary[]>((_, reject) => (fail = reject)));
    poller.setApi({ getSummaries: stale });
    const update = vi.fn();
    poller.subscribe("k1", A, update);
    await vi.advanceTimersByTimeAsync(1000);

    const fresh = summariesFrom(table);
    poller.setApi({ getSummaries: fresh });
    fail(new SteamApiError(401, "Steam API returned HTTP 401"));
    await vi.advanceTimersByTimeAsync(1000);

    expect(fresh).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalledWith({ kind: "auth" });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "view" }));

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fresh).toHaveBeenCalledTimes(2);
  });

  it("reports no key or a rejected key from latest(), so a re-render shows the placeholder", async () => {
    poller.subscribe("k1", A, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    expect(poller.latest(A)).toMatchObject({ kind: "view" });

    poller.setApi(undefined);
    expect(poller.latest(A)).toEqual({ kind: "nokey" });

    const rejecting = vi.fn(async (): Promise<PlayerSummary[]> => {
      throw new SteamApiError(403, "Steam API returned HTTP 403");
    });
    poller.setApi({ getSummaries: rejecting });
    await vi.advanceTimersByTimeAsync(1000);
    expect(poller.latest(A)).toEqual({ kind: "auth" });

    poller.setApi({ getSummaries });
    expect(poller.latest(A)).toMatchObject({ kind: "view" });
  });
});

describe("failures", () => {
  it("keeps the last state on a failed poll and recovers on the next", async () => {
    const update = vi.fn();
    getSummaries.mockRejectedValueOnce(new SteamApiError(500, "Steam API returned HTTP 500"));
    poller.subscribe("k1", A, update);

    await vi.advanceTimersByTimeAsync(1000);
    expect(update).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(59_000);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("does not retry faster after a 429", async () => {
    getSummaries.mockRejectedValue(new SteamApiError(429, "Steam API returned HTTP 429"));
    poller.subscribe("k1", A, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(58_999);
    expect(getSummaries).toHaveBeenCalledTimes(1);
  });

  it("stops polling on a rejected key and resumes with a new one", async () => {
    getSummaries.mockRejectedValueOnce(new SteamApiError(401, "Steam API returned HTTP 401"));
    const update = vi.fn();
    poller.subscribe("k1", A, update);

    await vi.advanceTimersByTimeAsync(1000);
    expect(update).toHaveBeenCalledExactlyOnceWith({ kind: "auth" });

    await vi.advanceTimersByTimeAsync(180_000);
    expect(getSummaries).toHaveBeenCalledTimes(1);

    const fresh = summariesFrom(table);
    poller.setApi({ getSummaries: fresh });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "view" }));
  });

  it("reports a missing key without calling the API", async () => {
    poller.setApi(undefined);
    const update = vi.fn();
    poller.subscribe("k1", A, update);

    await vi.advanceTimersByTimeAsync(1000);

    expect(getSummaries).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledExactlyOnceWith({ kind: "nokey" });
  });

  it("does not start a second poll while one is still running", async () => {
    let release: (value: PlayerSummary[]) => void = () => {};
    getSummaries.mockImplementationOnce(() => new Promise<PlayerSummary[]>((resolve) => (release = resolve)));
    poller.subscribe("k1", A, vi.fn());

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getSummaries).toHaveBeenCalledTimes(1);

    release([player(A)]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getSummaries).toHaveBeenCalledTimes(2);
  });
});

describe("came online", () => {
  const viewOf = (update: ReturnType<typeof vi.fn>, call: number) => update.mock.calls[call]?.[0].view;

  it("flags a friend who goes from offline to online, once", async () => {
    table[A] = player(A, { personaState: 0 });
    const update = vi.fn();
    poller.subscribe("k1", A, update);
    await vi.advanceTimersByTimeAsync(1000);
    expect(viewOf(update, 0).cameOnline).toBeUndefined();

    table[A] = player(A, { personaState: 1 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(update).toHaveBeenCalledTimes(2);
    expect(viewOf(update, 1)).toMatchObject({ state: "online", cameOnline: true });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ personaState: 3 }, "away"],
    [{ personaState: 2 }, "busy"],
    [{ personaState: 1, gameId: "730" }, "ingame"],
  ] as const)("flags offline to %j", async (change, state) => {
    table[A] = player(A, { personaState: 0 });
    const update = vi.fn();
    poller.subscribe("k1", A, update);
    await vi.advanceTimersByTimeAsync(1000);

    table[A] = player(A, change);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(viewOf(update, 1)).toMatchObject({ state, cameOnline: true });
  });

  it("does not flag the first observation of an online friend", async () => {
    const update = vi.fn();
    poller.subscribe("k1", A, update);
    await vi.advanceTimersByTimeAsync(1000);
    expect(viewOf(update, 0).cameOnline).toBeUndefined();
  });

  it("does not flag changes between non-offline states", async () => {
    const update = vi.fn();
    poller.subscribe("k1", A, update);
    await vi.advanceTimersByTimeAsync(1000);

    table[A] = player(A, { personaState: 3 });
    await vi.advanceTimersByTimeAsync(60_000);
    table[A] = player(A, { personaState: 1 });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(update).toHaveBeenCalledTimes(3);
    expect(viewOf(update, 1).cameOnline).toBeUndefined();
    expect(viewOf(update, 2).cameOnline).toBeUndefined();
  });

  it("does not flag the first online reading after the friend was missing from the response", async () => {
    table[A] = player(A, { personaState: 0 });
    const update = vi.fn();
    poller.subscribe("k1", A, update);
    await vi.advanceTimersByTimeAsync(1000);

    delete table[A];
    await vi.advanceTimersByTimeAsync(60_000);
    table[A] = player(A, { personaState: 1 });
    await vi.advanceTimersByTimeAsync(60_000);

    const last = update.mock.calls.at(-1)?.[0];
    expect(last).toMatchObject({ kind: "view", view: { state: "online" } });
    expect(last.view.cameOnline).toBeUndefined();
  });

  it("does not flag a friend re-pinned after being unpinned while offline", async () => {
    table[A] = player(A, { personaState: 0 });
    poller.subscribe("k1", A, vi.fn());
    poller.subscribe("k2", B, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);

    poller.subscribe("k1", B, vi.fn());
    await vi.advanceTimersByTimeAsync(60_000);
    table[A] = player(A, { personaState: 1 });
    const update = vi.fn();
    poller.subscribe("k1", A, update);
    await vi.advanceTimersByTimeAsync(1000);

    expect(viewOf(update, 0).cameOnline).toBeUndefined();
  });

  it("never stores the flag in latest()", async () => {
    table[A] = player(A, { personaState: 0 });
    poller.subscribe("k1", A, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    table[A] = player(A, { personaState: 1 });
    await vi.advanceTimersByTimeAsync(60_000);

    const latest = poller.latest(A);
    expect(latest).toMatchObject({ kind: "view", view: { state: "online" } });
    expect(latest?.kind === "view" && latest.view.cameOnline).toBeFalsy();
  });

  it("flags every key pinned to that friend", async () => {
    table[A] = player(A, { personaState: 0 });
    const first = vi.fn();
    const second = vi.fn();
    poller.subscribe("k1", A, first);
    poller.subscribe("k2", A, second);
    await vi.advanceTimersByTimeAsync(1000);

    table[A] = player(A, { personaState: 1 });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(viewOf(first, 1).cameOnline).toBe(true);
    expect(viewOf(second, 1).cameOnline).toBe(true);
  });
});

describe("poller races and resets", () => {
  it("does not flag a friend who came online while no key watched them", async () => {
    table[A] = player(A, { personaState: 0 });
    poller.subscribe("k1", A, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);

    poller.unsubscribe("k1");
    table[A] = player(A, { personaState: 1 });
    const update = vi.fn();
    poller.subscribe("k1", A, update);
    await vi.advanceTimersByTimeAsync(1000);

    expect(update.mock.calls[0]?.[0].view.cameOnline).toBeUndefined();
  });

  it("does not deliver a friend's result to a key whose friend changed mid-poll", async () => {
    table[A] = player(A, { personaState: 0 });
    poller.subscribe("k1", A, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);

    let release: () => void = () => {};
    getSummaries.mockImplementationOnce(async (ids: string[]) => {
      await new Promise<void>((resolve) => (release = resolve));
      return ids.flatMap((id) => (table[id] ? [table[id]] : []));
    });
    table[A] = player(A, { personaState: 1 });
    const update = vi.fn();
    poller.subscribe("k1", A, update);
    await vi.advanceTimersByTimeAsync(60_000);

    poller.subscribe("k1", B, update);
    release();
    await vi.advanceTimersByTimeAsync(0);

    expect(update.mock.calls.every(([u]) => u.kind !== "view" || u.view.steamId === B)).toBe(true);
  });
});

describe("idle behaviour", () => {
  it("stops ticking when only keys with no friend chosen remain", async () => {
    poller.subscribe("k1", A, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    poller.subscribe("k1", undefined, vi.fn());
    expect(vi.getTimerCount()).toBe(0);

    const calls = getSummaries.mock.calls.length;
    await vi.advanceTimersByTimeAsync(180_000);
    expect(getSummaries.mock.calls.length).toBe(calls);
  });

  it("polls soon, not after a full interval, when a key returns after a profile switch", async () => {
    poller.subscribe("k1", A, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    poller.unsubscribe("k1");

    const calls = getSummaries.mock.calls.length;
    poller.subscribe("k1", A, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    expect(getSummaries.mock.calls.length).toBe(calls + 1);
  });
});
