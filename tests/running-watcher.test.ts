import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRunningWatcher, type RunningWatcher } from "../src/running-watcher.js";

const logger = { error: vi.fn() };
let running: Set<string>;
let scan: ReturnType<typeof vi.fn<() => Promise<Set<string>>>>;
let watcher: RunningWatcher;

beforeEach(() => {
  vi.useFakeTimers();
  logger.error.mockClear();
  running = new Set();
  scan = vi.fn<() => Promise<Set<string>>>(async () => new Set(running));
  watcher = createRunningWatcher({ scan, logger });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("running watcher", () => {
  it("scans shortly after the first launch key appears, then every 5 seconds", async () => {
    watcher.subscribe("k1", "730", vi.fn());
    await vi.advanceTimersByTimeAsync(249);
    expect(scan).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(scan).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("reports only changes, starting from a not-running baseline", async () => {
    const onChange = vi.fn();
    watcher.subscribe("k1", "730", onChange);

    await vi.advanceTimersByTimeAsync(250);
    expect(onChange).not.toHaveBeenCalled();

    running.add("730");
    await vi.advanceTimersByTimeAsync(5000);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(watcher.isRunning("730")).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);
    expect(onChange).toHaveBeenCalledTimes(1);

    running.delete("730");
    await vi.advanceTimersByTimeAsync(5000);
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(watcher.isRunning("730")).toBe(false);
  });

  it("reports a game that is already running on the first scan", async () => {
    running.add("730");
    const onChange = vi.fn();
    watcher.subscribe("k1", "730", onChange);
    await vi.advanceTimersByTimeAsync(250);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("tells every key on the same game and ignores other games", async () => {
    const a = vi.fn();
    const b = vi.fn();
    const other = vi.fn();
    watcher.subscribe("k1", "730", a);
    watcher.subscribe("k2", "730", b);
    watcher.subscribe("k3", "20", other);
    running.add("730");
    await vi.advanceTimersByTimeAsync(250);
    expect(a).toHaveBeenCalledWith(true);
    expect(b).toHaveBeenCalledWith(true);
    expect(other).not.toHaveBeenCalled();
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("does not scan for keys without a valid game", async () => {
    watcher.subscribe("k1", undefined, vi.fn());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(scan).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops all timers when the last key goes", async () => {
    watcher.subscribe("k1", "730", vi.fn());
    await vi.advanceTimersByTimeAsync(250);
    watcher.unsubscribe("k1");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("keeps the last state and logs when a scan fails", async () => {
    running.add("730");
    const onChange = vi.fn();
    watcher.subscribe("k1", "730", onChange);
    await vi.advanceTimersByTimeAsync(250);

    scan.mockRejectedValueOnce(new Error("boom"));
    await vi.advanceTimersByTimeAsync(5000);

    expect(watcher.isRunning("730")).toBe(true);
    expect(logger.error).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("rescans soon when a key's game changes, even during a running scan", async () => {
    let release: (value: Set<string>) => void = () => {};
    scan.mockImplementationOnce(() => new Promise<Set<string>>((resolve) => (release = resolve)));
    const onChange = vi.fn();
    watcher.subscribe("k1", "730", onChange);
    await vi.advanceTimersByTimeAsync(250);

    running.add("20");
    watcher.subscribe("k1", "20", onChange);
    await vi.advanceTimersByTimeAsync(250);
    expect(scan).toHaveBeenCalledTimes(1);

    release(new Set());
    await vi.advanceTimersByTimeAsync(0);
    expect(scan).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it("does not start a second scan while one is running", async () => {
    let release: (value: Set<string>) => void = () => {};
    scan.mockImplementationOnce(() => new Promise<Set<string>>((resolve) => (release = resolve)));
    watcher.subscribe("k1", "730", vi.fn());
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(scan).toHaveBeenCalledTimes(1);
    release(new Set());
    await vi.advanceTimersByTimeAsync(5000);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("keeps notifying other keys when one listener throws", async () => {
    running.add("730");
    const good = vi.fn();
    watcher.subscribe("k1", "730", () => {
      throw new Error("boom");
    });
    watcher.subscribe("k2", "730", good);
    await vi.advanceTimersByTimeAsync(250);
    expect(good).toHaveBeenCalledWith(true);
    expect(logger.error).toHaveBeenCalled();
  });

  it("does not keep a stale ring after the watcher went idle and the game quit", async () => {
    running.add("730");
    watcher.subscribe("k1", "730", vi.fn());
    await vi.advanceTimersByTimeAsync(250);
    expect(watcher.isRunning("730")).toBe(true);

    watcher.unsubscribe("k1");
    expect(watcher.isRunning("730")).toBe(false);
  });

  it("reports a quit that happened while a key was away, when the render saw a stale state", async () => {
    running.add("730");
    const onChange = vi.fn();
    watcher.subscribe("k1", "730", onChange);
    await vi.advanceTimersByTimeAsync(250);
    running.delete("730");

    watcher.subscribe("k2", "730", onChange);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});
