import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "../src/timeout.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("passes the result through and leaves no timer", async () => {
    await expect(withTimeout(Promise.resolve(5), 1000, "late")).resolves.toBe(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes a rejection through", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000, "late")).rejects.toThrow("boom");
  });

  it("rejects with the message when the promise never settles", async () => {
    const result = withTimeout(new Promise<never>(() => {}), 1000, "took too long");
    const assertion = expect(result).rejects.toThrow("took too long");
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });
});
