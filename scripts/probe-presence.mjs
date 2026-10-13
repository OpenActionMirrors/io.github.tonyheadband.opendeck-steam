// One-off feasibility probe: how well does the Steam Web API report friends' presence?
// Usage: node --env-file=.env scripts/probe-presence.mjs   (.env is git-ignored and holds STEAM_WEB_API)
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const key = process.env.STEAM_API_KEY ?? process.env.STEAM_WEB_API;
if (!/^[0-9a-fA-F]{32}$/.test(key ?? "")) {
  console.error("Set STEAM_API_KEY or STEAM_WEB_API to your 32-character Steam Web API key.");
  process.exit(2);
}

const users = await readFile(join(homedir(), ".local", "share", "Steam", "config", "loginusers.vdf"), "utf8");
const accounts = [...users.matchAll(/"(\d{17})"\s*\{([^}]*)\}/g)];
const recent = accounts.find((account) => /"MostRecent"\s+"1"/.test(account[2])) ?? accounts[0];
if (!recent) {
  console.error("No account found in loginusers.vdf.");
  process.exit(2);
}

async function api(path, params) {
  const url = new URL(path, "https://api.steampowered.com");
  url.searchParams.set("key", key);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${path}`);
  return response.json();
}

const count = (items, keyOf) =>
  items.reduce((totals, item) => {
    const bucket = String(keyOf(item));
    totals[bucket] = (totals[bucket] ?? 0) + 1;
    return totals;
  }, {});

try {
  const list = await api("/ISteamUser/GetFriendList/v1/", { steamid: recent[1], relationship: "friend" });
  const ids = list.friendslist.friends.map((friend) => friend.steamid);

  const players = [];
  for (let i = 0; i < ids.length; i += 100) {
    const summary = await api("/ISteamUser/GetPlayerSummaries/v2/", { steamids: ids.slice(i, i + 100).join(",") });
    players.push(...summary.response.players);
  }

  const privateProfiles = players.filter((player) => player.communityvisibilitystate !== 3);
  console.log("friends:", ids.length, "| summaries returned:", players.length);
  console.log("by personastate (0 off, 1 on, 2 busy, 3 away, 4 snooze, 5/6 looking):", count(players, (p) => p.personastate ?? "missing"));
  console.log("in a game:", players.filter((p) => p.gameid || p.gameextrainfo).length);
  console.log("non-public profiles:", privateProfiles.length, "-> by personastate:", count(privateProfiles, (p) => p.personastate ?? "missing"));
  console.log("avatar hosts:", [...new Set(players.map((p) => { try { return new URL(p.avatarfull).hostname; } catch { return "none"; } }))]);
} catch (error) {
  console.error("Probe failed:", error instanceof Error ? error.message : "unknown error");
  process.exit(1);
}
