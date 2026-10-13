import { build } from "esbuild";
import { writeFile } from "node:fs/promises";

const out = "io.github.tonyheadband.opendeck-steam.sdPlugin/bin";

await build({
  entryPoints: ["src/plugin.ts"],
  outfile: `${out}/plugin.js`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  // The SDK's CommonJS dependencies call require(); ESM output has none by default.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});

await writeFile(`${out}/package.json`, '{ "type": "module" }\n');
