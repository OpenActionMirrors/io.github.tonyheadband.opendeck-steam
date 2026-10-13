import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGamesMessage, pushGames, type GamesMessage } from "../src/games-message.js";

const logger = { error: vi.fn(), info: vi.fn() };
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "games-"));
  await mkdir(join(root, "steamapps"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("buildGamesMessage", () => {
  it("reports Steam as not found with an empty list", async () => {
    expect(await buildGamesMessage(async () => undefined, logger)).toEqual({
      event: "games",
      steamFound: false,
      games: [],
    });
  });

  it("lists games with their appId, name and available art", async () => {
    await writeFile(
      join(root, "steamapps", "appmanifest_20.acf"),
      '"AppState" { "appid" "20" "name" "Quote \\" <b>&" "LastPlayed" "5" }',
    );
    const dir = join(root, "appcache", "librarycache", "20");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "header.jpg"), "x");

    expect(await buildGamesMessage(async () => root, logger)).toEqual({
      event: "games",
      steamFound: true,
      games: [{ appId: "20", name: 'Quote " <b>&', art: ["header"] }],
    });
  });

  it("reports Steam found with an empty list when there are no games", async () => {
    expect(await buildGamesMessage(async () => root, logger)).toEqual({ event: "games", steamFound: true, games: [] });
  });
});

describe("pushGames", () => {
  const message: GamesMessage = { event: "games", steamFound: true, games: [] };

  it("sends the game list to the panel", async () => {
    const ui = { sendToPropertyInspector: vi.fn().mockResolvedValue(undefined) };
    await pushGames(ui, async () => message, logger);
    expect(ui.sendToPropertyInspector).toHaveBeenCalledExactlyOnceWith(message);
  });

  it("logs and does not throw when the list cannot be built", async () => {
    logger.error.mockClear();
    const ui = { sendToPropertyInspector: vi.fn() };
    await expect(pushGames(ui, async () => Promise.reject(new Error("boom")), logger)).resolves.toBeUndefined();
    expect(ui.sendToPropertyInspector).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("logs and does not throw when sending fails", async () => {
    logger.error.mockClear();
    const ui = { sendToPropertyInspector: vi.fn().mockRejectedValue(new Error("socket closed")) };
    await expect(pushGames(ui, async () => message, logger)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
