import { describe, expect, it } from "vitest";
import {
  ARTS,
  chatUri,
  isSteamId,
  DEFAULT_ART,
  isAppId,
  launchUri,
  resolveArt,
  resolveFlash,
  resolveScale,
  DEFAULT_STATUS,
  DEFAULT_VIEW,
  STATUSES,
  VIEWS,
  resolveStatus,
  resolveView,
  statusUri,
  viewUri,
} from "../src/steam/uri.js";

describe("whitelists", () => {
  it("lists exactly the supported values", () => {
    expect([...STATUSES]).toEqual(["online", "away", "invisible", "offline"]);
    expect([...VIEWS]).toEqual(["account", "downloads", "friends", "games", "settings"]);
  });
});

describe("resolveStatus / resolveView", () => {
  it.each(STATUSES)("accepts status %s", (status) => {
    expect(resolveStatus(status)).toBe(status);
  });

  it.each(VIEWS)("accepts view %s", (view) => {
    expect(resolveView(view)).toBe(view);
  });

  it("falls back to the defaults when the setting is unset", () => {
    expect(resolveStatus(undefined)).toBe(DEFAULT_STATUS);
    expect(resolveView(undefined)).toBe(DEFAULT_VIEW);
    expect(DEFAULT_STATUS).toBe("online");
    expect(DEFAULT_VIEW).toBe("games");
  });

  it.each([
    "downloads; rm -rf ~",
    "../x",
    "",
    "ONLINE",
    "__proto__",
    "online ",
    5,
    null,
    {},
    ["online"],
  ])("rejects %j", (value) => {
    expect(resolveStatus(value)).toBeUndefined();
    expect(resolveView(value)).toBeUndefined();
  });

  it("rejects a value that is valid for the other action", () => {
    expect(resolveStatus("games")).toBeUndefined();
    expect(resolveView("online")).toBeUndefined();
  });
});

describe("uri builders", () => {
  it.each(STATUSES)("builds the status uri for %s", (status) => {
    expect(statusUri(status)).toBe(`steam://friends/status/${status}`);
  });

  it.each(VIEWS)("builds the view uri for %s", (view) => {
    expect(viewUri(view)).toBe(`steam://open/${view}`);
  });
});

describe("resolveArt", () => {
  it("lists exactly the supported art choices", () => {
    expect([...ARTS]).toEqual(["auto", "cover", "header", "logo"]);
  });

  it.each(ARTS)("accepts %s", (art) => {
    expect(resolveArt(art)).toBe(art);
  });

  it("defaults to auto when unset", () => {
    expect(resolveArt(undefined)).toBe(DEFAULT_ART);
    expect(DEFAULT_ART).toBe("auto");
  });

  it.each(["poster", "", "COVER", "cover ", "../x", 5, null, {}, ["cover"]])("rejects %j", (value) => {
    expect(resolveArt(value)).toBeUndefined();
  });
});

describe("isAppId", () => {
  it.each(["1", "250820", "0", "1234567890"])("accepts %j", (value) => {
    expect(isAppId(value)).toBe(true);
  });

  it.each(["", "12a", " 1", "1 ", "1\n", "../x", "-1", "1.5", "12345678901", 250820, null, undefined, {}])(
    "rejects %j",
    (value) => {
      expect(isAppId(value)).toBe(false);
    },
  );
});

describe("launchUri", () => {
  it("builds the rungameid uri", () => {
    expect(launchUri("250820")).toBe("steam://rungameid/250820");
  });
});

describe("isSteamId", () => {
  it.each(["76561198000000010", "76561198000000011", "00000000000000000"])("accepts %j", (value) => {
    expect(isSteamId(value)).toBe(true);
  });

  it.each(["", "7656119800000001", "765611980000000101", "7656119800000001a", " 76561198000000010", "76561198000000010\n", "../x", 76561198000000010, null, undefined, {}])(
    "rejects %j",
    (value) => {
      expect(isSteamId(value)).toBe(false);
    },
  );
});

describe("chatUri", () => {
  it("builds the friend chat uri", () => {
    expect(chatUri("76561198000000010")).toBe("steam://friends/message/76561198000000010");
  });
});

describe("resolveFlash", () => {
  it("defaults to on when unset", () => {
    expect(resolveFlash(undefined)).toBe("on");
  });

  it.each(["on", "off"] as const)("accepts %s", (value) => {
    expect(resolveFlash(value)).toBe(value);
  });

  it.each(["ON", "yes", "true", "", " on", true, false, 0, 1, null, {}, ["on"]])("rejects %j", (value) => {
    expect(resolveFlash(value)).toBeUndefined();
  });
});

describe("resolveScale", () => {
  it("defaults to 100 when unset", () => {
    expect(resolveScale(undefined)).toBe(100);
  });

  it.each([["20", 20], ["70", 70], ["100", 100], [45, 45], ["05", undefined]] as const)("reads %j", (value, expected) => {
    expect(resolveScale(value)).toBe(expected);
  });

  it.each(["", "19", "101", "-1", "7.5", "1e2", " 70", "abc", 19, 101, 7.5, NaN, Infinity, null, true, {}, [70]])("rejects %j", (value) => {
    expect(resolveScale(value)).toBeUndefined();
  });
});
