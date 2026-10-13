import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runFlash } from "../src/flash.js";

const FRAMES = { normal: "N", highlight: "H" };
let setImage: ReturnType<typeof vi.fn<(image: string) => Promise<void>>>;

beforeEach(() => {
  vi.useFakeTimers();
  setImage = vi.fn<(image: string) => Promise<void>>(async () => {});
});

afterEach(() => {
  vi.useRealTimers();
});

const shown = () => setImage.mock.calls.map(([image]) => image);

describe("runFlash", () => {
  it("shows the highlight immediately", () => {
    runFlash(FRAMES, setImage, vi.fn());
    expect(shown()).toEqual(["H"]);
  });

  it("alternates every 500 ms for 12 frames and ends on the normal frame", async () => {
    runFlash(FRAMES, setImage, vi.fn());
    await vi.advanceTimersByTimeAsync(500);
    expect(shown()).toEqual(["H", "N"]);

    await vi.advanceTimersByTimeAsync(5000);
    expect(shown()).toEqual(Array.from({ length: 12 }, (_, index) => (index % 2 === 0 ? "H" : "N")));
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(setImage).toHaveBeenCalledTimes(12);
  });

  it("stops when cancelled and leaves no timers", async () => {
    const cancel = runFlash(FRAMES, setImage, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    cancel();
    expect(vi.getTimerCount()).toBe(0);
    const before = setImage.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(setImage).toHaveBeenCalledTimes(before);
  });

  it("reports redraw failures and keeps going", async () => {
    setImage.mockRejectedValue(new Error("boom"));
    const onError = vi.fn();
    runFlash(FRAMES, setImage, onError);
    await vi.advanceTimersByTimeAsync(2000);
    expect(onError.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("reports a synchronous failure instead of throwing", () => {
    setImage.mockImplementation(() => {
      throw new Error("boom");
    });
    const onError = vi.fn();
    expect(() => runFlash(FRAMES, setImage, onError)).not.toThrow();
    expect(onError).toHaveBeenCalled();
  });
});
