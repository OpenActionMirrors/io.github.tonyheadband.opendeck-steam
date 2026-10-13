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

  let loadingFriendList = true;
  try {
    const ids = await options.api.getFriendIds(account.steamId);
    loadingFriendList = false;
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
    // Steam answers 401 for a private friends list, so only a 403 or a failing summaries call means a bad key.
    const privateList = loadingFriendList && error instanceof SteamApiError && error.status === 401;
    const rejected = error instanceof SteamApiError && (error.status === 401 || error.status === 403);
    const message = privateList
      ? "Steam refused the friend list: set your Friends List to Public, or check the API key"
      : rejected
        ? "Steam rejected this API key"
        : "Could not load friends";
    return { event: "friends", hasKey: true, me, friends: [], error: message };
  }
}
