import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findSteamRoot, listInstalledGames } from "../src/steam/library.js";

let root: string;
let second: string;
const logger = { error: vi.fn() };

beforeEach(async () => {
  logger.error.mockClear();
  root = await mkdtemp(join(tmpdir(), "steam-a-"));
  second = await mkdtemp(join(tmpdir(), "steam-b-"));
  await mkdir(join(root, "steamapps"), { recursive: true });
  await mkdir(join(second, "steamapps"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(second, { recursive: true, force: true });
});

const manifest = (appid: string, name: string, lastPlayed?: number) =>
  `"AppState" { "appid" "${appid}" "name" "${name}" ${lastPlayed === undefined ? "" : `"LastPlayed" "${lastPlayed}"`} }`;

async function addGame(library: string, appid: string, name: string, lastPlayed?: number) {
  await writeFile(join(library, "steamapps", `appmanifest_${appid}.acf`), manifest(appid, name, lastPlayed));
}

async function writeIndex(...paths: string[]) {
  const folders = paths.map((path, index) => `"${index}" { "path" "${path}" }`).join(" ");
  await writeFile(join(root, "steamapps", "libraryfolders.vdf"), `"libraryfolders" { ${folders} }`);
}

describe("listInstalledGames", () => {
  it("lists games from every existing library, newest played first, skipping a stale folder", async () => {
    await writeIndex(root, second, "/nonexistent/stale");
    await addGame(root, "10", "Old", 100);
    await addGame(root, "20", "New", 300);
    await addGame(second, "30", "Mid", 200);

    const games = await listInstalledGames(root, logger);

    expect(games.map((game) => game.name)).toEqual(["New", "Mid", "Old"]);
    expect(games[0]).toMatchObject({ appId: "20", lastPlayed: 300 });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("breaks ties by name and puts never-played games last", async () => {
    await writeIndex(root);
    await addGame(root, "1", "Zeta", 50);
    await addGame(root, "2", "Alpha", 50);
    await addGame(root, "3", "Never");

    const games = await listInstalledGames(root, logger);

    expect(games.map((game) => game.name)).toEqual(["Alpha", "Zeta", "Never"]);
    expect(games[2]?.lastPlayed).toBe(0);
  });

  it("hides Proton, Linux runtimes and redistributables but keeps lookalike games", async () => {
    await writeIndex(root);
    await addGame(root, "1", "Proton 8.0");
    await addGame(root, "2", "Proton Experimental");
    await addGame(root, "3", "Steam Linux Runtime 1.0 (scout)");
    await addGame(root, "4", "Steamworks Common Redistributables");
    await addGame(root, "5", "Protonic Adventures");
    await addGame(root, "6", "SteamVR");
    await addGame(root, "7", "Ubisoft Connect Services");
    await addGame(root, "8", "Ubisoft Connect Services Deluxe Game");

    const games = await listInstalledGames(root, logger);

    expect(games.map((game) => game.name).sort()).toEqual(["Protonic Adventures", "SteamVR", "Ubisoft Connect Services Deluxe Game"]);
  });

  it("skips malformed manifests and bad appids, logs them, and keeps the rest", async () => {
    await writeIndex(root);
    await addGame(root, "1", "Good");
    await writeFile(join(root, "steamapps", "appmanifest_2.acf"), '"AppState" {');
    await writeFile(join(root, "steamapps", "appmanifest_3.acf"), manifest("abc", "Bad id"));
    await writeFile(join(root, "steamapps", "appmanifest_4.acf"), '"Other" { "x" "1" }');

    const games = await listInstalledGames(root, logger);

    expect(games.map((game) => game.name)).toEqual(["Good"]);
    expect(logger.error).toHaveBeenCalledTimes(3);
  });

  it("still lists the main library when libraryfolders.vdf is missing or garbage", async () => {
    await addGame(root, "1", "Solo");
    expect((await listInstalledGames(root, logger)).map((game) => game.name)).toEqual(["Solo"]);

    await writeFile(join(root, "steamapps", "libraryfolders.vdf"), "not vdf at all");
    expect((await listInstalledGames(root, logger)).map((game) => game.name)).toEqual(["Solo"]);
  });

  it("does not list a game twice when two libraries mention the same folder", async () => {
    await writeIndex(root, root);
    await addGame(root, "1", "Once");
    expect(await listInstalledGames(root, logger)).toHaveLength(1);
  });

  it("reports which art each game has", async () => {
    await writeIndex(root);
    await addGame(root, "20", "Arty");
    const dir = join(root, "appcache", "librarycache", "20");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "header.jpg"), "x");
    await writeFile(join(dir, "logo.png"), "x");

    const [game] = await listInstalledGames(root, logger);

    expect(game?.art).toEqual(["header", "logo"]);
  });

  it("returns an empty list when the steamapps folder is unreadable", async () => {
    await rm(join(root, "steamapps"), { recursive: true });
    expect(await listInstalledGames(root, logger)).toEqual([]);
  });
});

describe("findSteamRoot", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "home-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("finds ~/.local/share/Steam", async () => {
    await mkdir(join(home, ".local", "share", "Steam", "steamapps"), { recursive: true });
    expect(await findSteamRoot(home)).toBe(await realpath(join(home, ".local", "share", "Steam")));
  });

  it("falls back to a ~/.steam/steam symlink and returns the real path", async () => {
    await mkdir(join(home, ".steam"), { recursive: true });
    await symlink(root, join(home, ".steam", "steam"));
    expect(await findSteamRoot(home)).toBe(await realpath(root));
  });

  it("returns undefined when Steam is not installed", async () => {
    expect(await findSteamRoot(home)).toBeUndefined();
  });
});
