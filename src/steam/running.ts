import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// Steam starts every game as `reaper SteamLaunch AppId=<id> -- <command>`, native or Proton.
export async function listRunningAppIds(procRoot = "/proc"): Promise<Set<string>> {
  const running = new Set<string>();

  let entries: string[];
  try {
    entries = await readdir(procRoot);
  } catch {
    return running;
  }

  await Promise.all(
    entries
      .filter((entry) => /^[0-9]+$/.test(entry))
      .map(async (pid) => {
        let raw: string;
        try {
          raw = await readFile(join(procRoot, pid, "cmdline"), "latin1");
        } catch {
          return; // the process exited, or belongs to someone else
        }

        const args = raw.split("\0");
        for (let i = 0; i + 1 < args.length; i++) {
          if (args[i] !== "SteamLaunch") continue;
          const match = /^AppId=([0-9]{1,10})$/.exec(args[i + 1] ?? "");
          if (match?.[1]) running.add(match[1]);
        }
      }),
  );
  return running;
}
