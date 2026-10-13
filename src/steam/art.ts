import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { imageSize } from "./image-size.js";
import { DEFAULT_SCALE, type Art, type ConcreteArt } from "./uri.js";

export type GameIconLoader = (appId: string, art: Art, options?: { running?: boolean; scale?: number }) => Promise<string>;

const AUTO_ORDER: readonly ConcreteArt[] = ["cover", "header", "logo"];

const FILES: Record<ConcreteArt, { names: readonly string[]; mime: string }> = {
  cover: { names: ["library_600x900.jpg"], mime: "image/jpeg" },
  header: { names: ["header.jpg", "library_header.jpg"], mime: "image/jpeg" },
  logo: { names: ["logo.png"], mime: "image/png" },
};

const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 144 144">';

const RING = '<rect x="4" y="4" width="136" height="136" rx="18" fill="none" stroke="#3ddc84" stroke-width="8"/>';

// The embedded raster is already base64, so wrapping the SVG in base64 again would inflate it by a
// third. Only the characters that are special in a URL need escaping; base64's + / = are safe.
const toDataUri = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${svg.replace(/[%#<>" \r\n]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)}`;

export const addRunningRing = (dataUri: string): string =>
  toDataUri(`${SVG_OPEN}<image width="144" height="144" xlink:href="${dataUri}"/>${RING}</svg>`);

const isDigits = (value: string): boolean => /^[0-9]+$/.test(value);

const TILE = '<rect width="144" height="144" rx="20" fill="#1b2838"/>';
const round = (value: number): number => Math.round(value * 100) / 100;

// At 100 the art covers the tile exactly as before. Below that, the same covering size is shrunk
// around the centre, so a wide header reveals more of itself and the tile colour shows as a border.
function placeImage(kind: ConcreteArt, bytes: Buffer, href: string, scale: number): string {
  const factor = scale / 100;
  if (kind === "logo") {
    const side = round(120 * factor);
    const at = round((144 - side) / 2);
    return `${TILE}<image x="${at}" y="${at}" width="${side}" height="${side}" preserveAspectRatio="xMidYMid meet" xlink:href="${href}"/>`;
  }
  if (factor === 1) return `<image width="144" height="144" preserveAspectRatio="xMidYMid slice" xlink:href="${href}"/>`;

  const size = imageSize(bytes);
  if (!size) {
    const crop = `<image width="144" height="144" preserveAspectRatio="xMidYMid slice" xlink:href="${href}"/>`;
    return `${TILE}<g transform="translate(72 72) scale(${factor}) translate(-72 -72)">${crop}</g>`;
  }

  const cover = Math.max(144 / size.width, 144 / size.height) * factor;
  const width = round(size.width * cover);
  const height = round(size.height * cover);
  return `${TILE}<image x="${round((144 - width) / 2)}" y="${round((144 - height) / 2)}" width="${width}" height="${height}" xlink:href="${href}"/>`;
}

function wrap(kind: ConcreteArt, bytes: Buffer, running: boolean, scale: number): string {
  const href = `data:${FILES[kind].mime};base64,${bytes.toString("base64")}`;
  return toDataUri(`${SVG_OPEN}${placeImage(kind, bytes, href, scale)}${running ? RING : ""}</svg>`);
}

// Steam keeps some assets directly in the game's folder and others one level down in
// hash-named subfolders, so look in both. A file directly in the folder wins.
async function locate(root: string, appId: string): Promise<Partial<Record<ConcreteArt, string>>> {
  const found: Partial<Record<ConcreteArt, string>> = {};

  const scan = async (dir: string): Promise<string[]> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    for (const entry of entries.filter((candidate) => candidate.isFile())) {
      for (const kind of AUTO_ORDER) {
        if (found[kind] === undefined && FILES[kind].names.includes(entry.name)) found[kind] = join(dir, entry.name);
      }
    }
    return entries.filter((candidate) => candidate.isDirectory()).map((candidate) => join(dir, candidate.name));
  };

  for (const subfolder of await scan(join(root, "appcache", "librarycache", appId))) await scan(subfolder);
  return found;
}

export async function availableArt(root: string, appId: string): Promise<ConcreteArt[]> {
  if (!isDigits(appId)) return [];
  const found = await locate(root, appId);
  return AUTO_ORDER.filter((kind) => found[kind] !== undefined);
}

export function createGameIconLoader(options: {
  steamRoot: () => Promise<string | undefined>;
  fallback: () => Promise<string>;
}): GameIconLoader {
  return async (appId, art, loaderOptions) => {
    const running = loaderOptions?.running === true;
    const scale = loaderOptions?.scale ?? DEFAULT_SCALE;
    const fallback = async () => {
      const base = await options.fallback();
      return running ? addRunningRing(base) : base;
    };

    const root = await options.steamRoot();
    if (root === undefined || !isDigits(appId)) return fallback();

    const found = await locate(root, appId);
    const order = art === "auto" ? AUTO_ORDER : [art, ...AUTO_ORDER.filter((kind) => kind !== art)];
    for (const kind of order) {
      const path = found[kind];
      if (path === undefined) continue;
      try {
        return wrap(kind, await readFile(path), running, scale);
      } catch {
        // Unreadable art is treated like missing art; try the next kind.
      }
    }
    return fallback();
  };
}
