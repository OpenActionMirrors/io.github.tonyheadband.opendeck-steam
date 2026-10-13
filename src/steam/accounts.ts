import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isSteamId } from "./uri.js";
import { parseVdf } from "./vdf.js";

export interface OwnAccount {
  steamId: string;
  name: string;
}

export async function readOwnAccount(root: string): Promise<OwnAccount | undefined> {
  try {
    const users = parseVdf(await readFile(join(root, "config", "loginusers.vdf"), "utf8")).users;
    if (typeof users !== "object") return undefined;

    const accounts = Object.entries(users).flatMap(([steamId, entry]) =>
      isSteamId(steamId) && typeof entry === "object"
        ? [{ steamId, name: typeof entry.PersonaName === "string" && entry.PersonaName ? entry.PersonaName : "Me", recent: entry.MostRecent === "1" }]
        : [],
    );
    const chosen = accounts.find((account) => account.recent) ?? accounts[0];
    return chosen && { steamId: chosen.steamId, name: chosen.name };
  } catch {
    return undefined;
  }
}
