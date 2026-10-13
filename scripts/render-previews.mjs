// Renders the README preview images from the plugin's own icon code with synthetic data.
// Needs ImageMagick (magick) and Inkscape on PATH. Usage: node scripts/render-previews.mjs
import { build } from "esbuild";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const plugin = "io.github.tonyheadband.opendeck-steam.sdPlugin";
const work = await mkdtemp(join(tmpdir(), "previews-"));

try {
  await build({
    stdin: {
      contents: `
        export { composeFriendIcon } from "./src/friend-icon.ts";
        export { createGameIconLoader } from "./src/steam/art.ts";
        export { createIconLoader } from "./src/icons.ts";
      `,
      resolveDir: process.cwd(),
    },
    outfile: join(work, "icons.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const { composeFriendIcon, createGameIconLoader, createIconLoader } = await import(pathToFileURL(join(work, "icons.mjs")));

  const magick = (...args) => execFileSync("magick", args);
  const gradient = (size, from, to, dest, extra = []) =>
    magick("-size", size, `gradient:${from}-${to}`, ...extra, dest);

  const steam = join(work, "steam");
  const art = async (appId, from, to, mark) => {
    const dir = join(steam, "appcache", "librarycache", appId);
    await mkdir(dir, { recursive: true });
    const decorate = ["-fill", mark, "-draw", "circle 300,380 300,220", "-fill", "#ffffff22", "-draw", "rectangle 0,640 600,900"];
    gradient("600x900", from, to, join(dir, "library_600x900.jpg"), decorate);
    gradient("460x215", from, to, join(dir, "header.jpg"), ["-fill", mark, "-draw", "circle 230,107 230,40"]);
  };
  await art("1001", "#0f2027", "#2c7a7b", "#f6d365");
  await art("1002", "#3a1c71", "#d76d77", "#ffaf7b");
  await art("1003", "#134e5e", "#71b280", "#e8f5c8");

  const iconBase = new URL(`file://${process.cwd()}/${plugin}/imgs/`);
  const loadIcon = createIconLoader(iconBase);
  const game = createGameIconLoader({ steamRoot: async () => steam, fallback: () => loadIcon("actions/launch/generic.svg") });

  const avatars = {};
  for (const [name, from, to] of [["a", "#ff9a9e", "#fad0c4"], ["b", "#a1c4fd", "#c2e9fb"], ["c", "#d4fc79", "#96e6a1"], ["d", "#fbc2eb", "#a6c1ee"], ["e", "#fdcbf1", "#e6dee9"]]) {
    const dest = join(work, `avatar-${name}.png`);
    gradient("184x184", from, to, dest, ["-fill", "#ffffff99", "-draw", "circle 92,78 92,46", "-draw", "ellipse 92,170 56,48 180,360"]);
    avatars[name] = dest;
  }
  const { readFileSync } = await import("node:fs");
  const friend = (state, avatar, options) => composeFriendIcon(state, readFileSync(avatars[avatar]), options);

  const status = (name) => loadIcon(`actions/status/${name}.svg`);
  const view = (name) => loadIcon(`actions/openview/${name}.svg`);
  const keys = [
    await status("online"), await status("away"), await status("invisible"), await status("offline"), await view("friends"),
    await view("games"), await view("downloads"), await view("account"), await view("settings"), await loadIcon("actions/launch/generic.svg"),
    await game("1001", "cover", { running: true }), await game("1002", "header"), await game("1003", "cover", { scale: 70 }),
    friend("ingame", "a"), friend("online", "b"),
  ];

  // Inkscape does not load percent-encoded SVG data URIs, so re-encode them as base64.
  const plain = "data:image/svg+xml;charset=utf-8,";
  const embeddable = (href) =>
    href.startsWith(plain)
      ? `data:image/svg+xml;base64,${Buffer.from(decodeURIComponent(href.slice(plain.length))).toString("base64")}`
      : href;

  const KEY = 144, GAP = 18, PAD = 30;
  const sheet = (items, columns, background = "#12161c") => {
    const rows = Math.ceil(items.length / columns);
    const width = PAD * 2 + columns * KEY + (columns - 1) * GAP;
    const height = PAD * 2 + rows * KEY + (rows - 1) * GAP;
    const images = items
      .map((href, i) => {
        const x = PAD + (i % columns) * (KEY + GAP);
        const y = PAD + Math.floor(i / columns) * (KEY + GAP);
        return (
          `<clipPath id="k${i}"><rect x="${x}" y="${y}" width="${KEY}" height="${KEY}" rx="20"/></clipPath>` +
          `<image x="${x}" y="${y}" width="${KEY}" height="${KEY}" clip-path="url(#k${i})" href="${embeddable(href)}"/>`
        );
      })
      .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="28" fill="${background}"/>${images}</svg>`;
  };

  const states = [
    friend("ingame", "a"), friend("online", "b"), friend("busy", "c"), friend("away", "d"), friend("offline", "e"),
    friend("online", "b", { highlight: true }),
  ];

  const out = join(process.cwd(), "docs", "images");
  await mkdir(out, { recursive: true });
  for (const [name, svg] of [["keys", sheet(keys, 5)], ["friend-states", sheet(states, 6)]]) {
    const src = join(work, `${name}.svg`);
    await writeFile(src, svg);
    execFileSync("inkscape", [src, "--export-type=png", `--export-filename=${join(out, `${name}.png`)}`, "--export-width=1600"], { stdio: "ignore" });
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
