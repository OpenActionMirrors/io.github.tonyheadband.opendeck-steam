type Listener = (running: boolean) => void | Promise<void>;

export interface RunningWatcher {
  subscribe(id: string, appId: string | undefined, onChange: Listener): void;
  unsubscribe(id: string): void;
  isRunning(appId: string): boolean;
}

export function createRunningWatcher(deps: {
  scan: () => Promise<Set<string>>;
  logger: { error(...data: unknown[]): void };
  intervalMs?: number;
  debounceMs?: number;
}): RunningWatcher {
  const intervalMs = deps.intervalMs ?? 5_000;
  const debounceMs = deps.debounceMs ?? 250;

  const subscribers = new Map<string, { appId: string | undefined; onChange: Listener }>();
  const lastSent = new Map<string, boolean>();
  let running = new Set<string>();
  let scanning = false;
  let rerun = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  let pending: ReturnType<typeof setTimeout> | undefined;

  const watching = () => [...subscribers].some(([, subscriber]) => subscriber.appId !== undefined);

  // `wanted` marks a debounced trigger; if one lands during a scan it re-runs once afterwards.
  async function scan(wanted = false): Promise<void> {
    if (scanning) {
      if (wanted) rerun = true;
      return;
    }
    scanning = true;
    try {
      running = await deps.scan();
      for (const [id, subscriber] of subscribers) {
        if (subscriber.appId === undefined) continue;
        const now = running.has(subscriber.appId);
        if ((lastSent.get(id) ?? false) === now) continue;

        lastSent.set(id, now);
        try {
          void Promise.resolve(subscriber.onChange(now)).catch((error: unknown) => deps.logger.error("Running-state update failed", error));
        } catch (error) {
          deps.logger.error("Running-state update failed", error);
        }
      }
    } catch (error) {
      deps.logger.error("Running-game scan failed", error);
    } finally {
      scanning = false;
      if (rerun) {
        rerun = false;
        void scan();
      }
    }
  }

  function scheduleSoon(): void {
    if (pending) return;
    pending = setTimeout(() => {
      pending = undefined;
      void scan(true);
    }, debounceMs);
  }

  function stopIfIdle(): void {
    if (watching()) return;
    if (interval) clearInterval(interval);
    if (pending) clearTimeout(pending);
    interval = undefined;
    pending = undefined;
    running = new Set();
  }

  return {
    subscribe(id, appId, onChange) {
      const previous = subscribers.get(id);
      subscribers.set(id, { appId, onChange });
      // Seeded with what the render that accompanies a subscribe saw, so only real changes report.
      if (previous?.appId !== appId) {
        if (appId === undefined) lastSent.delete(id);
        else lastSent.set(id, running.has(appId));
      }
      if (appId === undefined) {
        stopIfIdle();
        return;
      }
      if (!interval) interval = setInterval(() => void scan(), intervalMs);
      scheduleSoon();
    },

    unsubscribe(id) {
      subscribers.delete(id);
      lastSent.delete(id);
      stopIfIdle();
    },

    isRunning: (appId) => running.has(appId),
  };
}
