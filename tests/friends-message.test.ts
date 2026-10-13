import { describe, expect, it, vi } from "vitest";
import { buildFriendsMessage } from "../src/friends-message.js";
import type { PlayerSummary } from "../src/steam/presence.js";
import { SteamApiError } from "../src/steam/web-api.js";

const ME = "76561198000000001";
const A = "76561198000000002";
const B = "76561198000000003";
const C = "76561198000000004";
const logger = { error: vi.fn() };
const own = async () => ({ steamId: ME, name: "Tony" });

const player = (steamId: string, name: string, over: Partial<PlayerSummary> = {}): PlayerSummary => ({
  steamId,
  name,
  personaState: 1,
  ...over,
});

describe("buildFriendsMessage", () => {
  it("reports no key with an empty list", async () => {
    expect(await buildFriendsMessage({ api: undefined, own, logger })).toEqual({
      event: "friends",
      hasKey: false,
      me: { steamId: ME, name: "Tony" },
      friends: [],
    });
  });

  it("reports no account when loginusers.vdf is unreadable", async () => {
    const message = await buildFriendsMessage({ api: undefined, own: async () => undefined, logger });
    expect(message.me).toBeNull();
  });

  it("lists active friends first, then the rest by name, and uses the API name for me", async () => {
    const api = {
      getFriendIds: vi.fn(async () => [A, B, C]),
      getSummaries: vi.fn(async () => [
        player(ME, "Tony (API)"),
        player(A, "Zed", { personaState: 0 }),
        player(B, "Bea", { personaState: 0 }),
        player(C, "Cal", { gameId: "730" }),
      ]),
    };

    const message = await buildFriendsMessage({ api, own, logger });

    expect(api.getFriendIds).toHaveBeenCalledWith(ME);
    expect(api.getSummaries).toHaveBeenCalledWith([ME, A, B, C]);
    expect(message).toEqual({
      event: "friends",
      hasKey: true,
      me: { steamId: ME, name: "Tony (API)" },
      friends: [
        { steamId: C, name: "Cal", state: "ingame" },
        { steamId: B, name: "Bea", state: "offline" },
        { steamId: A, name: "Zed", state: "offline" },
      ],
    });
  });

  it("keeps friends the API returned no summary for", async () => {
    const api = { getFriendIds: async () => [A], getSummaries: async () => [player(ME, "Tony")] };
    const message = await buildFriendsMessage({ api, own, logger });
    expect(message.friends).toEqual([{ steamId: A, name: `Friend ${A}`, state: "offline" }]);
  });

  it("returns a fixed error string and logs when the API rejects the key", async () => {
    logger.error.mockClear();
    const api = {
      getFriendIds: async (): Promise<string[]> => {
        throw new SteamApiError(403, "Steam API returned HTTP 403");
      },
      getSummaries: async () => [],
    };
    const message = await buildFriendsMessage({ api, own, logger });
    expect(message).toMatchObject({ hasKey: true, friends: [], error: "Steam rejected this API key" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("returns a generic error for any other failure", async () => {
    const api = {
      getFriendIds: async (): Promise<string[]> => {
        throw new Error("secret detail");
      },
      getSummaries: async () => [],
    };
    const message = await buildFriendsMessage({ api, own, logger });
    expect(message.error).toBe("Could not load friends");
    expect(JSON.stringify(message)).not.toContain("secret detail");
  });

  it("reports an error when there is a key but no local account", async () => {
    const api = { getFriendIds: async () => [], getSummaries: async () => [] };
    const message = await buildFriendsMessage({ api, own: async () => undefined, logger });
    expect(message).toMatchObject({ hasKey: true, me: null, friends: [], error: "Could not read your Steam account" });
  });
});
