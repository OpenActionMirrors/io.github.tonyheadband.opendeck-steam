import { describe, expect, it, vi } from "vitest";
import { memoize } from "../src/memo.js";

describe("memoize", () => {
  it("shares one run between concurrent callers", async () => {
    const work = vi.fn(async () => "v");
    const memo = memoize(work, 1000);
    expect(await Promise.all([memo(), memo(), memo()])).toEqual(["v", "v", "v"]);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("reuses the result within the ttl and reruns after it", async () => {
    let time = 0;
    const work = vi.fn(async () => "v");
    const memo = memoize(work, 1000, () => time);
    await memo();
    time = 999;
    await memo();
    expect(work).toHaveBeenCalledTimes(1);
    time = 1000;
    await memo();
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures", async () => {
    const work = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("boom")).mockResolvedValue("ok");
    const memo = memoize(work, 1000);
    await expect(memo()).rejects.toThrow("boom");
    expect(await memo()).toBe("ok");
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("reruns after clear()", async () => {
    const work = vi.fn(async () => "v");
    const memo = memoize(work, 1000);
    await memo();
    memo.clear();
    await memo();
    expect(work).toHaveBeenCalledTimes(2);
  });
});
