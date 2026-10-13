import { readCapped } from "./body.js";
import type { PlayerSummary } from "./presence.js";
import { isSteamId } from "./uri.js";

const BASE_URL = "https://api.steampowered.com";
const MAX_BODY_BYTES = 5_000_000;
const CHUNK_SIZE = 100;

// Messages are fixed strings on purpose: fetch errors and URLs can contain the API key.
export class SteamApiError extends Error {
  constructor(
    readonly status: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "SteamApiError";
  }
}

export interface SteamApi {
  getFriendIds(steamId: string): Promise<string[]>;
  getSummaries(steamIds: string[]): Promise<PlayerSummary[]>;
}

const asText = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

function toSummary(player: unknown): PlayerSummary | undefined {
  if (typeof player !== "object" || player === null) return undefined;
  const raw = player as Record<string, unknown>;
  if (!isSteamId(raw.steamid)) return undefined;

  const state = typeof raw.personastate === "number" && Number.isFinite(raw.personastate) ? raw.personastate : 0;
  return {
    steamId: raw.steamid,
    name: (asText(raw.personaname) ?? "").slice(0, 64),
    personaState: state,
    ...(asText(raw.gameid) ? { gameId: asText(raw.gameid) } : {}),
    ...(asText(raw.gameextrainfo) ? { gameName: asText(raw.gameextrainfo) } : {}),
    ...(asText(raw.avatarfull) ? { avatarUrl: asText(raw.avatarfull) } : {}),
  };
}

export function createSteamApi(options: { key: string; fetch: typeof fetch; timeoutMs?: number }): SteamApi {
  const { key, timeoutMs = 10_000 } = options;

  async function get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(path, BASE_URL);
    url.searchParams.set("key", key);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

    let response: Response;
    try {
      // The key travels in the query string, so a redirect must never carry it elsewhere.
      response = await options.fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    } catch {
      throw new SteamApiError(undefined, "Steam API request failed");
    }
    if (!response.ok) throw new SteamApiError(response.status, `Steam API returned HTTP ${response.status}`);

    let text: string;
    try {
      const body = await readCapped(response, MAX_BODY_BYTES);
      if (body === undefined) throw new SteamApiError(undefined, "Steam API response was too large");
      text = body.toString("utf8");
    } catch (error) {
      if (error instanceof SteamApiError) throw error;
      throw new SteamApiError(undefined, "Steam API response could not be read");
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new SteamApiError(undefined, "Steam API returned invalid JSON");
    }
  }

  return {
    async getFriendIds(steamId) {
      const body = await get("/ISteamUser/GetFriendList/v1/", { steamid: steamId, relationship: "friend" });
      const friends = (body as { friendslist?: { friends?: unknown } } | null)?.friendslist?.friends;
      if (!Array.isArray(friends)) throw new SteamApiError(undefined, "Steam API returned an unexpected friend list");
      return friends.map((friend) => (friend as { steamid?: unknown } | null)?.steamid).filter(isSteamId);
    },

    async getSummaries(steamIds) {
      const ids = [...new Set(steamIds.filter(isSteamId))];
      const summaries: PlayerSummary[] = [];

      for (let start = 0; start < ids.length; start += CHUNK_SIZE) {
        const body = await get("/ISteamUser/GetPlayerSummaries/v2/", {
          steamids: ids.slice(start, start + CHUNK_SIZE).join(","),
        });
        const players = (body as { response?: { players?: unknown } } | null)?.response?.players;
        if (!Array.isArray(players)) throw new SteamApiError(undefined, "Steam API returned unexpected player data");
        for (const player of players) {
          const summary = toSummary(player);
          if (summary) summaries.push(summary);
        }
      }
      return summaries;
    },
  };
}
