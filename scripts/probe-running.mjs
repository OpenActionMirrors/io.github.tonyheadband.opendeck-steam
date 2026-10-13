// Run once with a Steam game open (expect its app id) and once with none (expect none).
import { readdir, readFile } from "node:fs/promises";

const found = new Set();
for (const pid of (await readdir("/proc")).filter((entry) => /^[0-9]+$/.test(entry))) {
  let raw;
  try {
    raw = await readFile(`/proc/${pid}/cmdline`, "latin1");
  } catch {
    continue;
  }
  const args = raw.split("\0");
  for (let i = 0; i + 1 < args.length; i++) {
    const match = args[i] === "SteamLaunch" ? /^AppId=([0-9]{1,10})$/.exec(args[i + 1] ?? "") : null;
    if (match) found.add(match[1]);
  }
}
console.log(found.size ? `running app ids: ${[...found].join(", ")}` : "no running Steam games found");
