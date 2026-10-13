import { readCapped } from "./body.js";

export type AvatarLoader = (url: string) => Promise<Buffer | undefined>;

export function isAllowedAvatarUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  return url.hostname === "steamcdn-a.akamaihd.net" || url.hostname.endsWith(".steamstatic.com");
}

const isJpegOrPng = (bytes: Buffer): boolean =>
  (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
  (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47);

export function createAvatarLoader(options: { fetch: typeof fetch; timeoutMs?: number; maxBytes?: number }): AvatarLoader {
  const { timeoutMs = 10_000, maxBytes = 1_000_000 } = options;
  const cache = new Map<string, Buffer>();

  return async (url) => {
    const cached = cache.get(url);
    if (cached) return cached;
    if (!isAllowedAvatarUrl(url)) return undefined;

    try {
      const response = await options.fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
      if (!response.ok) return undefined;
      if (Number(response.headers.get("content-length")) > maxBytes) return undefined;

      const bytes = await readCapped(response, maxBytes);
      if (bytes === undefined || bytes.length === 0 || !isJpegOrPng(bytes)) return undefined;

      cache.set(url, bytes);
      return bytes;
    } catch {
      return undefined;
    }
  };
}
