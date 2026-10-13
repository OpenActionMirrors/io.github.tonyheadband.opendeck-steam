// Lists Steam windows. With the Friends List open, expect a window titled "Friends List".
// `--close-friends` asks exactly that window to close, to prove closing works.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const { stdout } = await run("wmctrl", ["-lx"]);

const windows = stdout
  .split("\n")
  .flatMap((line) => {
    const match = /^(0x[0-9a-f]+)\s+(-?\d+)\s+(\S+)\s+(\S+)\s*(.*)$/.exec(line);
    return match ? [{ id: match[1], className: match[3], title: match[5] }] : [];
  })
  .filter((window) => /steam/i.test(window.className));

for (const window of windows) console.log(window.id, window.className, JSON.stringify(window.title));

if (process.argv.includes("--close-friends")) {
  const target = windows.find((window) => window.title === "Friends List");
  if (!target) {
    console.error('No window titled exactly "Friends List" found.');
    process.exit(1);
  }
  await run("wmctrl", ["-i", "-c", target.id]);
  console.log("close requested for", target.id);
}
