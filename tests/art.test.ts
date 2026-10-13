import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addRunningRing, availableArt, createGameIconLoader } from "../src/steam/art.js";

const COVER = Buffer.from("cover-bytes");
const HEADER = Buffer.from("header-bytes");
const LOGO = Buffer.from("logo-bytes");
const FALLBACK = "data:image/svg+xml;base64,FALLBACK";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "art-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function addArt(appId: string, files: Record<string, Buffer>) {
  const dir = join(root, "appcache", "librarycache", appId);
  await mkdir(dir, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(dir, name), bytes);
}

async function addNested(appId: string, sub: string, files: Record<string, Buffer>) {
  const dir = join(root, "appcache", "librarycache", appId, sub);
  await mkdir(dir, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(dir, name), bytes);
}

const ALL = { "library_600x900.jpg": COVER, "header.jpg": HEADER, "logo.png": LOGO };

const loader = (steamRoot: string | undefined = root) =>
  createGameIconLoader({ steamRoot: async () => steamRoot, fallback: async () => FALLBACK });

function svgOf(dataUri: string): string {
  const base64 = "data:image/svg+xml;base64,";
  const plain = "data:image/svg+xml;charset=utf-8,";
  if (dataUri.startsWith(base64)) return Buffer.from(dataUri.slice(base64.length), "base64").toString("utf8");
  expect(dataUri.startsWith(plain)).toBe(true);
  return decodeURIComponent(dataUri.slice(plain.length));
}

const embedded = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString("base64")}`;

describe("createGameIconLoader", () => {
  it("fills the key with the cover, cropped", async () => {
    await addArt("10", ALL);
    const svg = svgOf(await loader()("10", "cover"));
    expect(svg).toContain(embedded("image/jpeg", COVER));
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
  });

  it("fills the key with the header, cropped", async () => {
    await addArt("10", ALL);
    const svg = svgOf(await loader()("10", "header"));
    expect(svg).toContain(embedded("image/jpeg", HEADER));
    expect(svg).toContain("slice");
  });

  it("centres the logo on a dark tile without cropping", async () => {
    await addArt("10", ALL);
    const svg = svgOf(await loader()("10", "logo"));
    expect(svg).toContain(embedded("image/png", LOGO));
    expect(svg).toContain("#1b2838");
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).not.toContain("slice");
  });

  it("auto prefers cover, then header, then logo", async () => {
    await addArt("1", ALL);
    await addArt("2", { "header.jpg": HEADER, "logo.png": LOGO });
    await addArt("3", { "logo.png": LOGO });
    expect(svgOf(await loader()("1", "auto"))).toContain(embedded("image/jpeg", COVER));
    expect(svgOf(await loader()("2", "auto"))).toContain(embedded("image/jpeg", HEADER));
    expect(svgOf(await loader()("3", "auto"))).toContain(embedded("image/png", LOGO));
  });

  it("falls back to the auto order when the chosen art is missing", async () => {
    await addArt("10", { "header.jpg": HEADER });
    const svg = svgOf(await loader()("10", "cover"));
    expect(svg).toContain(embedded("image/jpeg", HEADER));
  });

  it("returns the fallback icon when no art exists", async () => {
    await addArt("10", {});
    expect(await loader()("10", "auto")).toBe(FALLBACK);
    expect(await loader()("999", "auto")).toBe(FALLBACK);
  });

  it("returns the fallback icon when Steam is not found", async () => {
    expect(await loader(undefined)("10", "auto")).toBe(FALLBACK);
  });

  it("refuses an appid that is not all digits, so no path can escape librarycache", async () => {
    await mkdir(join(root, "appcache"), { recursive: true });
    await writeFile(join(root, "appcache", "header.jpg"), HEADER);
    expect(await loader()("../..", "header")).toBe(FALLBACK);
    expect(await loader()("", "auto")).toBe(FALLBACK);
  });
});

describe("Steam's hashed art layout", () => {
  it("finds cover, header (library_header.jpg) and logo in per-asset subfolders", async () => {
    await addNested("10", "aaa", { "library_600x900.jpg": COVER });
    await addNested("10", "bbb", { "library_header.jpg": HEADER });
    await addNested("10", "ccc", { "logo.png": LOGO });

    expect(svgOf(await loader()("10", "cover"))).toContain(embedded("image/jpeg", COVER));
    expect(svgOf(await loader()("10", "header"))).toContain(embedded("image/jpeg", HEADER));
    expect(svgOf(await loader()("10", "logo"))).toContain(embedded("image/png", LOGO));
    expect(await availableArt(root, "10")).toEqual(["cover", "header", "logo"]);
  });

  it("mixes flat and nested files, preferring the flat file", async () => {
    await addArt("10", { "header.jpg": HEADER });
    await addNested("10", "aaa", { "library_header.jpg": Buffer.from("nested-header"), "library_600x900.jpg": COVER });

    expect(svgOf(await loader()("10", "header"))).toContain(embedded("image/jpeg", HEADER));
    expect(svgOf(await loader()("10", "auto"))).toContain(embedded("image/jpeg", COVER));
  });

  it("ignores stray files such as the hashed icon jpg next to the folders", async () => {
    await addArt("10", { "0123abcd.jpg": Buffer.from("icon") });
    await addNested("10", "aaa", { "library_hero.jpg": Buffer.from("hero") });
    expect(await availableArt(root, "10")).toEqual([]);
    expect(await loader()("10", "auto")).toBe(FALLBACK);
  });
});

describe("availableArt", () => {
  it("lists existing art in cover, header, logo order", async () => {
    await addArt("10", { "logo.png": LOGO, "library_600x900.jpg": COVER });
    expect(await availableArt(root, "10")).toEqual(["cover", "logo"]);
  });

  it("is empty for unknown games and non-digit appids", async () => {
    expect(await availableArt(root, "404")).toEqual([]);
    expect(await availableArt(root, "../x")).toEqual([]);
  });
});

describe("running ring", () => {
  const RING = 'stroke="#3ddc84" stroke-width="8"';

  it.each(["cover", "header", "logo"] as const)("draws the ring on %s art only while running", async (art) => {
    await addArt("10", ALL);
    expect(svgOf(await loader()("10", art, { running: true }))).toContain(RING);
    expect(svgOf(await loader()("10", art))).not.toContain("#3ddc84");
    expect(svgOf(await loader()("10", art, { running: false }))).not.toContain("#3ddc84");
  });

  it("keeps the art itself when ringed", async () => {
    await addArt("10", ALL);
    const svg = svgOf(await loader()("10", "cover", { running: true }));
    expect(svg).toContain(embedded("image/jpeg", COVER));
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
  });

  it("rings the generic fallback by embedding it", async () => {
    const ringed = svgOf(await loader()("999", "auto", { running: true }));
    expect(ringed).toContain(`xlink:href="${FALLBACK}"`);
    expect(ringed).toContain(RING);
    expect(await loader()("999", "auto", { running: false })).toBe(FALLBACK);
    expect(await loader()("999", "auto")).toBe(FALLBACK);
  });

  it("rings the fallback when Steam is not found or the appid is bad", async () => {
    expect(svgOf(await loader(undefined)("10", "auto", { running: true }))).toContain(RING);
    expect(svgOf(await loader()("../..", "auto", { running: true }))).toContain(RING);
  });

  it("addRunningRing returns a valid svg data URI", () => {
    expect(addRunningRing("data:image/png;base64,AAAA")).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });
});

describe("svg data URI encoding", () => {
  it("is not base64-wrapped a second time, so it stays close to the raster size", async () => {
    await addArt("10", { "library_600x900.jpg": Buffer.alloc(300_000, 7) });
    const uri = await loader()("10", "cover");
    expect(uri.length).toBeLessThan(Math.ceil((300_000 * 4) / 3) + 1000);
  });

  it("escapes characters that would end or corrupt a URL", () => {
    const uri = addRunningRing('data:image/svg+xml;base64,AA==#x"<y>%');
    const body = uri.slice("data:image/svg+xml;charset=utf-8,".length);
    expect(body).not.toMatch(/[#<>"\s]/);
    expect(decodeURIComponent(body)).toContain('xlink:href="data:image/svg+xml;base64,AA==#x"<y>%"');
  });
});

describe("scaling", () => {
  // 460x215 png header, like a Steam header image: only the dimensions are read.
  const pngOf = (width: number, height: number): Buffer => {
    const bytes = Buffer.alloc(40);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
    return bytes;
  };
  const imageTag = (svg: string) => /<image [^>]*>/.exec(svg)?.[0] ?? "";

  it("leaves art untouched at 100", async () => {
    await addArt("10", ALL);
    const plain = await loader()("10", "cover");
    expect(await loader()("10", "cover", { scale: 100 })).toBe(plain);
    expect(svgOf(plain)).not.toContain("#1b2838");
  });

  it("shrinks wide art around the centre, keeping its aspect ratio, over a border colour", async () => {
    await addArt("10", { "header.jpg": pngOf(460, 215) });
    const svg = svgOf(await loader()("10", "header", { scale: 50 }));
    expect(svg).toContain('<rect width="144" height="144" rx="20" fill="#1b2838"/>');
    // cover size is 308.09x144; at 50% it is 154.05x72, centred.
    const tag = imageTag(svg);
    expect(tag).toContain('width="154.05"');
    expect(tag).toContain('height="72"');
    expect(tag).toContain('x="-5.03"');
    expect(tag).toContain('y="36"');
  });

  it("shrinks portrait art the same way", async () => {
    await addArt("10", { "library_600x900.jpg": pngOf(600, 900) });
    const tag = imageTag(svgOf(await loader()("10", "cover", { scale: 50 })));
    expect(tag).toContain('width="72"');
    expect(tag).toContain('height="108"');
    expect(tag).toContain('x="36"');
    expect(tag).toContain('y="18"');
  });

  it("falls back to scaling the cropped square when the dimensions are unreadable", async () => {
    await addArt("10", ALL);
    const svg = svgOf(await loader()("10", "cover", { scale: 50 }));
    expect(svg).toContain("translate(72 72) scale(0.5) translate(-72 -72)");
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
  });

  it("shrinks the logo box", async () => {
    await addArt("10", ALL);
    const tag = imageTag(svgOf(await loader()("10", "logo", { scale: 50 })));
    expect(tag).toContain('width="60"');
    expect(tag).toContain('x="42"');
  });

  it("keeps the running ring full size on scaled art and does not scale the fallback", async () => {
    await addArt("10", ALL);
    expect(svgOf(await loader()("10", "cover", { scale: 50, running: true }))).toContain('width="136" height="136"');
    expect(await loader()("999", "auto", { scale: 50 })).toBe(FALLBACK);
  });
});
