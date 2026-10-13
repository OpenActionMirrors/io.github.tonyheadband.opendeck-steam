import { access, readdir, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { availableArt } from "./art.js";
import type { ConcreteArt } from "./uri.js";
import { parseVdf } from "./vdf.js";

export interface InstalledGame {
  appId: string;
  name: string;
  lastPlayed: number;
  art: ConcreteArt[];
}

type Logger = { error(...data: unknown[]): void };

const NOT_GAMES = /^(Proton\b|Steam Linux Runtime|Steamworks Common Redistributables$|Ubisoft Connect Services$)/;

export async function findSteamRoot(home: string = homedir()): Promise<string | undefined> {
  for (const candidate of [join(home, ".local", "share", "Steam"), join(home, ".steam", "steam")]) {
    try {
      const real = await realpath(candidate);
      await access(join(real, "steamapps"));
      return real;
    } catch {
      // Not installed here; try the next location.
    }
  }
  return undefined;
}

async function libraryPaths(root: string): Promise<string[]> {
  const paths = [root];
  try {
    const index = parseVdf(await readFile(join(root, "steamapps", "libraryfolders.vdf"), "utf8"));
    const folders = index.libraryfolders;
    if (typeof folders === "object") {
      for (const folder of Object.values(folders)) {
        if (typeof folder === "object" && typeof folder.path === "string" && !paths.includes(folder.path)) {
          paths.push(folder.path);
        }
      }
    }
  } catch {
    // Without a readable index only the main library is scanned.
  }
  return paths;
}

async function readManifest(file: string): Promise<Omit<InstalledGame, "art">> {
  const state = parseVdf(await readFile(file, "utf8")).AppState;
  if (typeof state !== "object") throw new Error("no AppState block");

  const { appid, name, LastPlayed } = state;
  if (typeof appid !== "string" || !/^[0-9]+$/.test(appid)) throw new Error("invalid appid");
  if (typeof name !== "string") throw new Error("missing name");

  const lastPlayed = typeof LastPlayed === "string" ? Number(LastPlayed) : 0;
  return { appId: appid, name, lastPlayed: Number.isFinite(lastPlayed) ? lastPlayed : 0 };
}

export async function listInstalledGames(root: string, logger: Logger): Promise<InstalledGame[]> {
  const found = new Map<string, Omit<InstalledGame, "art">>();

  for (const library of await libraryPaths(root)) {
    const steamapps = join(library, "steamapps");
    let entries: string[];
    try {
      entries = await readdir(steamapps);
    } catch {
      continue;
    }

    for (const entry of entries.filter((name) => /^appmanifest_[0-9]+\.acf$/.test(name))) {
      try {
        const game = await readManifest(join(steamapps, entry));
        if (!NOT_GAMES.test(game.name)) found.set(game.appId, game);
      } catch (error) {
        logger.error(`Skipping ${entry}`, error);
      }
    }
  }

  const games = await Promise.all(
    [...found.values()].map(async (game) => ({ ...game, art: await availableArt(root, game.appId) })),
  );
  return games.sort((a, b) => b.lastPlayed - a.lastPlayed || a.name.localeCompare(b.name));
}
