import { describe, expect, it } from "vitest";
import { parseVdf, type VdfObject } from "../src/steam/vdf.js";

const LIBRARY_FOLDERS = `
"libraryfolders"
{
	"0"
	{
		"path"		"/home/u/.local/share/Steam"
		"label"		""
		"apps"
		{
			"228980"		"423240306"
			"250820"		"5494303681"
		}
	}
	"1"
	{
		"path"		"/mnt/linuxgames/Steam"
		"apps"
		{
			"1628350"		"784495627"
		}
	}
}
`;

const MANIFEST = `
"AppState"
{
	"appid"		"250820"
	"name"		"SteamVR"
	"StateFlags"		"4"
	"LastPlayed"		"1791847961"
}
`;

const section = (value: unknown): VdfObject => value as VdfObject;

describe("parseVdf", () => {
  it("parses the libraryfolders shape with nested blocks", () => {
    const root = section(parseVdf(LIBRARY_FOLDERS).libraryfolders);
    expect(section(root["0"]).path).toBe("/home/u/.local/share/Steam");
    expect(section(root["0"]).label).toBe("");
    expect(section(section(root["0"]).apps)["250820"]).toBe("5494303681");
    expect(section(root["1"]).path).toBe("/mnt/linuxgames/Steam");
  });

  it("parses an appmanifest", () => {
    const state = section(parseVdf(MANIFEST).AppState);
    expect(state.appid).toBe("250820");
    expect(state.name).toBe("SteamVR");
    expect(state.LastPlayed).toBe("1791847961");
  });

  it("unescapes backslashes and quotes", () => {
    const parsed = parseVdf(String.raw`"k" "C:\\Games \"q\" a\tb"`);
    expect(parsed.k).toBe('C:\\Games "q" a\tb');
  });

  it("ignores // comments and empty input", () => {
    expect(parseVdf('// header\n"a" "1" // trailing\n').a).toBe("1");
    expect(Object.keys(parseVdf(""))).toEqual([]);
  });

  it("treats a __proto__ key as plain data", () => {
    const parsed = parseVdf('"__proto__" { "x" "1" }');
    expect(Object.keys(parsed)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it.each([
    ['"a" {', /missing '}'/],
    ["}", /unexpected '}'/],
    ['"a"', /missing value/],
    ['"a', /unterminated string/],
    ["garbage", /unexpected character/],
    ['{ "a" "1" }', /expected a key/],
  ])("throws a clear error for %j", (text, message) => {
    expect(() => parseVdf(text)).toThrow(message);
  });
});
