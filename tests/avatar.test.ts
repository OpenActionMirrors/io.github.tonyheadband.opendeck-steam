import { describe, expect, it, vi } from "vitest";
import { createAvatarLoader, isAllowedAvatarUrl } from "../src/steam/avatar.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const GOOD = "https://avatars.steamstatic.com/abc_full.jpg";

describe("isAllowedAvatarUrl", () => {
  it.each([
    GOOD,
    "https://avatars.fastly.steamstatic.com/abc_full.jpg",
    "https://avatars.akamai.steamstatic.com/abc_full.jpg",
    "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/ab/abc_full.jpg",
  ])("accepts %s", (url) => {
    expect(isAllowedAvatarUrl(url)).toBe(true);
  });

  it.each([
    "http://avatars.steamstatic.com/abc.jpg",
    "https://evilsteamstatic.com/abc.jpg",
    "https://steamstatic.com.evil.test/abc.jpg",
    "https://steamstatic.com/abc.jpg",
    "https://avatars.steamstatic.com.evil.test/abc.jpg",
    "https://user:pass@avatars.steamstatic.com/abc.jpg",
    "https://avatars.steamstatic.com@evil.test/abc.jpg",
    "https://avatars.steamstatic.com:8443/abc.jpg",
    "https://127.0.0.1/abc.jpg",
    "https://[::1]/abc.jpg",
    "https://akamaihd.net/abc.jpg",
    "https://other.akamaihd.net/abc.jpg",
    "ftp://avatars.steamstatic.com/abc.jpg",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(isAllowedAvatarUrl(url)).toBe(false);
  });
});

const ok = (bytes: Buffer, headers: Record<string, string> = {}) => new Response(bytes, { status: 200, headers });

function loaderWith(handler: (url: string, init?: RequestInit) => Response | Promise<Response>, maxBytes?: number) {
  const fetchMock = vi.fn(async (input: URL | string, init?: RequestInit) => handler(String(input), init));
  return { load: createAvatarLoader({ fetch: fetchMock as unknown as typeof fetch, maxBytes }), fetchMock };
}

describe("createAvatarLoader", () => {
  it("downloads a jpeg and a png", async () => {
    const jpeg = loaderWith(() => ok(JPEG));
    expect(await jpeg.load(GOOD)).toEqual(JPEG);
    const png = loaderWith(() => ok(PNG));
    expect(await png.load(GOOD)).toEqual(PNG);
  });

  it("caches successes per url", async () => {
    const { load, fetchMock } = loaderWith(() => ok(JPEG));
    await load(GOOD);
    await load(GOOD);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    let attempts = 0;
    const { load, fetchMock } = loaderWith(() => (++attempts === 1 ? new Response("", { status: 500 }) : ok(JPEG)));
    expect(await load(GOOD)).toBeUndefined();
    expect(await load(GOOD)).toEqual(JPEG);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses a disallowed url without calling fetch", async () => {
    const { load, fetchMock } = loaderWith(() => ok(JPEG));
    expect(await load("https://evilsteamstatic.com/abc.jpg")).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses redirects and passes a timeout signal", async () => {
    const { load, fetchMock } = loaderWith(() => ok(JPEG));
    await load(GOOD);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects bodies that are not jpeg or png", async () => {
    const { load } = loaderWith(() => ok(Buffer.from("<html><script>alert(1)</script></html>")));
    expect(await load(GOOD)).toBeUndefined();
  });

  it("rejects oversized and empty bodies", async () => {
    const big = loaderWith(() => ok(Buffer.concat([JPEG, Buffer.alloc(2000)])), 1000);
    expect(await big.load(GOOD)).toBeUndefined();

    const declared = loaderWith(() => ok(JPEG, { "content-length": "999999999" }), 1000);
    expect(await declared.load(GOOD)).toBeUndefined();

    const empty = loaderWith(() => ok(Buffer.alloc(0)));
    expect(await empty.load(GOOD)).toBeUndefined();
  });

  it("returns undefined instead of throwing when fetch fails", async () => {
    const { load } = loaderWith(() => {
      throw new Error("network down");
    });
    expect(await load(GOOD)).toBeUndefined();
  });
});
