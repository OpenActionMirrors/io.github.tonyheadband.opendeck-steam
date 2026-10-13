export interface Memo<T> {
  (): Promise<T>;
  clear(): void;
}

// Collapses bursts of identical work (OpenDeck builds every settings panel at profile load) into
// one run: concurrent callers share the in-flight promise, later ones reuse it for `ttlMs`.
// Failures are never cached.
export function memoize<T>(work: () => Promise<T>, ttlMs: number, now: () => number = Date.now): Memo<T> {
  let cached: { promise: Promise<T>; at: number } | undefined;

  const memo = (() => {
    if (cached && now() - cached.at < ttlMs) return cached.promise;

    const entry = { promise: work(), at: now() };
    cached = entry;
    entry.promise.catch(() => {
      if (cached === entry) cached = undefined;
    });
    return entry.promise;
  }) as Memo<T>;

  memo.clear = () => {
    cached = undefined;
  };
  return memo;
}
