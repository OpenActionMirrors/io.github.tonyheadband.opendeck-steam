import { readFile } from "node:fs/promises";

export type IconLoader = (relativePath: string) => Promise<string>;

export function createIconLoader(baseDir: URL): IconLoader {
  const cache = new Map<string, string>();

  return async (relativePath) => {
    const cached = cache.get(relativePath);
    if (cached) return cached;

    const svg = await readFile(new URL(relativePath, baseDir));
    const dataUri = `data:image/svg+xml;base64,${svg.toString("base64")}`;
    cache.set(relativePath, dataUri);
    return dataUri;
  };
}
