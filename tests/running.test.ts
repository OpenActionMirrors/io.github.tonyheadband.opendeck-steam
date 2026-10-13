import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listRunningAppIds } from "../src/steam/running.js";

let proc: string;

beforeEach(async () => {
  proc = await mkdtemp(join(tmpdir(), "proc-"));
});

afterEach(async () => {
  await rm(proc, { recursive: true, force: true });
});

async function addProcess(pid: string, args: string[]) {
  await mkdir(join(proc, pid), { recursive: true });
  await writeFile(join(proc, pid, "cmdline"), args.join("\0") + "\0");
}

describe("listRunningAppIds", () => {
  it("finds a Proton game", async () => {
    await addProcess("101", ["reaper", "SteamLaunch", "AppId=1245620", "--", "/steam/proton", "waitforexitandrun", "/g/game.exe"]);
    expect([...(await listRunningAppIds(proc))]).toEqual(["1245620"]);
  });

  it("finds a native game launched through a full reaper path", async () => {
    await addProcess("102", ["/home/u/.local/share/Steam/ubuntu12_32/reaper", "SteamLaunch", "AppId=730", "--", "/g/cs2"]);
    expect([...(await listRunningAppIds(proc))]).toEqual(["730"]);
  });

  it("finds several games at once and de-duplicates", async () => {
    await addProcess("1", ["reaper", "SteamLaunch", "AppId=10", "--", "a"]);
    await addProcess("2", ["reaper", "SteamLaunch", "AppId=20", "--", "b"]);
    await addProcess("3", ["reaper", "SteamLaunch", "AppId=10", "--", "c"]);
    expect([...(await listRunningAppIds(proc))].sort()).toEqual(["10", "20"]);
  });

  it.each([
    [["reaper", "SteamLaunch", "AppId=abc"]],
    [["reaper", "SteamLaunch", "AppId=12345678901"]],
    [["reaper", "SteamLaunch", "AppId="]],
    [["reaper", "SteamLaunch"]],
    [["reaper", "AppId=5"]],
    [["reaper", "SteamLaunch", "xAppId=5"]],
    [["reaper", "SteamLaunch", "AppId=5x"]],
    [["bash", "-c", "echo SteamLaunch AppId=5"]],
  ])("ignores %j", async (args) => {
    await addProcess("200", args);
    expect((await listRunningAppIds(proc)).size).toBe(0);
  });

  it("ignores non-numeric entries and processes with no readable cmdline", async () => {
    await mkdir(join(proc, "self"), { recursive: true });
    await writeFile(join(proc, "self", "cmdline"), ["reaper", "SteamLaunch", "AppId=99"].join("\0"));
    await writeFile(join(proc, "cpuinfo"), "x");
    await mkdir(join(proc, "300"), { recursive: true });
    expect((await listRunningAppIds(proc)).size).toBe(0);
  });

  it("returns an empty set for an empty or missing proc root", async () => {
    expect((await listRunningAppIds(proc)).size).toBe(0);
    expect((await listRunningAppIds(join(proc, "missing"))).size).toBe(0);
  });
});
