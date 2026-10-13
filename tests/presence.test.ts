import { describe, expect, it } from "vitest";
import { STATE_COLORS, stateOf } from "../src/steam/presence.js";

describe("stateOf", () => {
  it.each([
    [{ personaState: 0 }, "offline"],
    [{ personaState: 0, gameId: "730" }, "offline"],
    [{ personaState: 0, gameName: "Counter-Strike 2" }, "offline"],
    [{ personaState: 1 }, "online"],
    [{ personaState: 5 }, "online"],
    [{ personaState: 6 }, "online"],
    [{ personaState: 2 }, "busy"],
    [{ personaState: 3 }, "away"],
    [{ personaState: 4 }, "away"],
    [{ personaState: 1, gameId: "730" }, "ingame"],
    [{ personaState: 1, gameName: "Counter-Strike 2" }, "ingame"],
    [{ personaState: 3, gameId: "730" }, "ingame"],
    [{ personaState: 2, gameName: "Hades" }, "ingame"],
    [{ personaState: 7 }, "online"],
  ] as const)("%j is %s", (summary, expected) => {
    expect(stateOf(summary)).toBe(expected);
  });
});

describe("STATE_COLORS", () => {
  it("uses blue for online and green for in game", () => {
    expect(STATE_COLORS.online).toBe("#4da3ff");
    expect(STATE_COLORS.ingame).toBe("#3ddc84");
    expect(STATE_COLORS.busy).toBe("#e5534b");
    expect(STATE_COLORS.away).toBe("#f5a623");
    expect(STATE_COLORS.offline).toBe("#5f6368");
  });
});
