import { describe, expect, it, vi } from "vitest";
import { readCapped } from "../src/steam/body.js";

describe("readCapped", () => {
  it("returns the whole body when it fits", async () => {
    const body = await readCapped(new Response("hello"), 10);
    expect(body?.toString()).toBe("hello");
  });

  it("accepts a body of exactly the cap", async () => {
    expect((await readCapped(new Response("12345"), 5))?.length).toBe(5);
  });

  it("returns undefined for a body over the cap", async () => {
    expect(await readCapped(new Response("123456"), 5)).toBeUndefined();
  });

  it("stops reading and cancels an endless stream once the cap is exceeded", async () => {
    const cancel = vi.fn();
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(1024));
      },
      cancel,
    });

    expect(await readCapped(new Response(stream), 4096)).toBeUndefined();
    expect(cancel).toHaveBeenCalled();
    expect(pulled).toBeLessThan(20);
  });

  it("handles an empty body", async () => {
    expect((await readCapped(new Response(""), 5))?.length).toBe(0);
  });
});
