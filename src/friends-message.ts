import type { OwnAccount } from "./steam/accounts.js";
import { stateOf, type PresenceState } from "./steam/presence.js";
import { SteamApiError, type SteamApi } from "./steam/web-api.js";

export type FriendsMessage = {
  event: "friends";
  hasKey: boolean;
  me: { steamId: string; name: string } | null;
  friends: { steamId: string; name: string; state: PresenceState }[];
  error?: string;
};

export async function buildFriendsMessage(options: {
  api: Pick<SteamApi, "getFriendIds" | "getSummaries"> | undefined;
  own: () => Promise<OwnAccount | undefined>;
  logger: { error(...data: unknown[]): void };
}): Promise<FriendsMessage> {
  const account = await options.own();
  const me = account ? { steamId: account.steamId, name: account.name } : null;

  if (!options.api) return { event: "friends", hasKey: false, me, friends: [] };
  if (!account) {
    return { event: "friends", hasKey: true, me: null, friends: [], error: "Could not read your Steam account" };
  }

  try {
    const ids = await options.api.getFriendIds(account.steamId);
    const summaries = new Map((await options.api.getSummaries([account.steamId, ...ids])).map((summary) => [summary.steamId, summary]));

    const friends = ids
      .map((steamId) => {
        const summary = summaries.get(steamId);
        return summary
          ? { steamId, name: summary.name || `Friend ${steamId}`, state: stateOf(summary) }
          : { steamId, name: `Friend ${steamId}`, state: "offline" as const };
      })
      .sort((a, b) => Number(b.state !== "offline") - Number(a.state !== "offline") || a.name.localeCompare(b.name));

    const own = summaries.get(account.steamId);
    return { event: "friends", hasKey: true, me: { steamId: account.steamId, name: own?.name || account.name }, friends };
  } catch (error) {
    options.logger.error("Could not load friends", error);
    const rejected = error instanceof SteamApiError && (error.status === 401 || error.status === 403);
    return { event: "friends", hasKey: true, me, friends: [], error: rejected ? "Steam rejected this API key" : "Could not load friends" };
  }
}
