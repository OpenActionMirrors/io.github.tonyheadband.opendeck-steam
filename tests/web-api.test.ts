import { describe, expect, it, vi } from "vitest";
import { createSteamApi, SteamApiError } from "../src/steam/web-api.js";

const KEY = "0123456789abcdef0123456789abcdef";
const ME = "76561198000000001";
const A = "76561198000000002";
const B = "76561198000000003";

const respond = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

function apiWith(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: URL | string, init?: RequestInit) => handler(new URL(String(input)), init));
  return { api: createSteamApi({ key: KEY, fetch: fetchMock as unknown as typeof fetch }), fetchMock };
}

describe("getFriendIds", () => {
  it("requests the friend list with the key and returns valid ids only", async () => {
    const { api, fetchMock } = apiWith(() =>
      respond({ friendslist: { friends: [{ steamid: A }, { steamid: B }, { steamid: "bad" }, {}, null] } }),
    );

    expect(await api.getFriendIds(ME)).toEqual([A, B]);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin).toBe("https://api.steampowered.com");
    expect(url.pathname).toBe("/ISteamUser/GetFriendList/v1/");
    expect(url.searchParams.get("key")).toBe(KEY);
    expect(url.searchParams.get("steamid")).toBe(ME);
    expect(url.searchParams.get("relationship")).toBe("friend");
  });

  it("accepts an empty friend list", async () => {
    const { api } = apiWith(() => respond({ friendslist: { friends: [] } }));
    expect(await api.getFriendIds(ME)).toEqual([]);
  });
});

describe("getSummaries", () => {
  it("maps player fields and skips entries without a valid steamid", async () => {
    const { api } = apiWith(() =>
      respond({
        response: {
          players: [
            { steamid: A, personaname: "Alice", personastate: 1, avatarfull: "https://avatars.steamstatic.com/a_full.jpg" },
            { steamid: B, personaname: "Bob", personastate: 1, gameid: "730", gameextrainfo: "Counter-Strike 2" },
            { steamid: "bad", personaname: "Nope" },
            { steamid: ME, personaname: "Me" },
          ],
        },
      }),
    );

    expect(await api.getSummaries([A, B, ME])).toEqual([
      { steamId: A, name: "Alice", personaState: 1, avatarUrl: "https://avatars.steamstatic.com/a_full.jpg" },
      { steamId: B, name: "Bob", personaState: 1, gameId: "730", gameName: "Counter-Strike 2" },
      { steamId: ME, name: "Me", personaState: 0 },
    ]);
  });

  it("makes no request for an empty or all-invalid id list", async () => {
    const { api, fetchMock } = apiWith(() => respond({}));
    expect(await api.getSummaries([])).toEqual([]);
    expect(await api.getSummaries(["bad", ""])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dedupes ids and drops invalid ones before requesting", async () => {
    const { api, fetchMock } = apiWith(() => respond({ response: { players: [] } }));
    await api.getSummaries([A, A, "bad", B]);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/ISteamUser/GetPlayerSummaries/v2/");
    expect(url.searchParams.get("steamids")).toBe(`${A},${B}`);
  });

  it("chunks requests at 100 ids", async () => {
    const ids = Array.from({ length: 250 }, (_, index) => `7656119800000${String(index).padStart(4, "0")}`);
    const { api, fetchMock } = apiWith((url) => {
      const asked = (url.searchParams.get("steamids") ?? "").split(",");
      return respond({ response: { players: asked.map((steamid) => ({ steamid, personaname: "x", personastate: 1 })) } });
    });

    const summaries = await api.getSummaries(ids);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([input]) => (new URL(String(input)).searchParams.get("steamids") ?? "").split(",").length)).toEqual([100, 100, 50]);
    expect(summaries).toHaveLength(250);
  });

  it("passes a timeout signal to fetch", async () => {
    const { api, fetchMock } = apiWith(() => respond({ response: { players: [] } }));
    await api.getSummaries([A]);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("failures", () => {
  it.each([
    [401, 401],
    [403, 403],
    [429, 429],
    [500, 500],
  ])("HTTP %i becomes a SteamApiError with that status", async (httpStatus, expected) => {
    const { api } = apiWith(() => respond({}, httpStatus));
    const error = await api.getSummaries([A]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SteamApiError);
    expect((error as SteamApiError).status).toBe(expected);
  });

  it("refuses redirects, because the key is in the query string", async () => {
    const { api, fetchMock } = apiWith(() => respond({ friendslist: { friends: [] } }));
    await api.getFriendIds(ME);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
  });

  const failures: [string, () => Response | Promise<Response>][] = [
    ["HTTP 401", () => respond({}, 401)],
    ["HTTP 500", () => respond({}, 500)],
    ["invalid json", () => respond("<html>nope</html>")],
    ["unexpected shape", () => respond({})],
    ["oversized body", () => respond("x".repeat(5_000_001))],
    [
      "network error that mentions the key",
      () => {
        throw new Error(`connect ECONNREFUSED https://api.steampowered.com/x?key=${KEY}`);
      },
    ],
  ];

  it.each(failures)("%s: throws a SteamApiError that never contains the key", async (_name, handler) => {
    const { api } = apiWith(handler);

    for (const call of [() => api.getSummaries([A]), () => api.getFriendIds(ME)]) {
      const error = await call().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(SteamApiError);
      expect((error as Error).message).not.toContain(KEY);
      expect(String((error as Error).stack)).not.toContain(KEY);
      expect(JSON.stringify(error)).not.toContain(KEY);
    }
  });

  it("reports no status for parse and shape failures", async () => {
    for (const handler of [() => respond("<html>"), () => respond({})]) {
      const { api } = apiWith(handler);
      const error = await api.getSummaries([A]).catch((caught: unknown) => caught);
      expect((error as SteamApiError).status).toBeUndefined();
    }
  });
});
