import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWmctrl, findFriendsWindow, parseWmctrl, type WindowControl } from "../src/steam/windows.js";

const OUTPUT = [
  "0x05000043  0 steamwebhelper.steam  myhost Steam",
  "0x05000052  0 steamwebhelper.steam  myhost Special Offers",
  "0x05000099  0 steamwebhelper.steam  myhost Friends List",
  "0x06000001  1 Navigator.firefox     myhost Friends List - Mozilla Firefox",
  "0x06000002 -1 desktop.plasmashell   myhost",
  "garbage line",
  "",
].join("\n");

describe("parseWmctrl", () => {
  it("parses id, class and title, tolerating empty titles and junk lines", () => {
    expect(parseWmctrl(OUTPUT)).toEqual([
      { id: "0x05000043", className: "steamwebhelper.steam", title: "Steam" },
      { id: "0x05000052", className: "steamwebhelper.steam", title: "Special Offers" },
      { id: "0x05000099", className: "steamwebhelper.steam", title: "Friends List" },
      { id: "0x06000001", className: "Navigator.firefox", title: "Friends List - Mozilla Firefox" },
      { id: "0x06000002", className: "desktop.plasmashell", title: "" },
    ]);
  });

  it("returns an empty list for empty output", () => {
    expect(parseWmctrl("")).toEqual([]);
  });
});

describe("findFriendsWindow", () => {
  const control = (windows: Awaited<ReturnType<WindowControl["list"]>>): WindowControl => ({
    list: async () => windows,
    close: async () => {},
  });

  it("finds the Steam window titled exactly Friends List", async () => {
    const found = await findFriendsWindow(control(parseWmctrl(OUTPUT)));
    expect(found).toMatchObject({ id: "0x05000099" });
  });

  it.each([
    [[{ id: "0x1", className: "Navigator.firefox", title: "Friends List" }]],
    [[{ id: "0x1", className: "steamwebhelper.steam", title: "Friends List - chat" }]],
    [[{ id: "0x1", className: "steamwebhelper.steam", title: "friends list" }]],
    [[{ id: "0x1", className: "steamwebhelper.steam", title: "Steam" }]],
    [[]],
  ])("does not match %j", async (windows) => {
    expect(await findFriendsWindow(control(windows))).toBeUndefined();
  });
});

describe("createWmctrl", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wmctrl-"));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  async function fakeWmctrl() {
    const fixture = join(dir, "output.txt");
    const log = join(dir, "args.txt");
    await writeFile(fixture, OUTPUT);
    const script = join(dir, "wmctrl");
    await writeFile(script, `#!/bin/sh\nif [ "$1" = "-lx" ]; then /bin/cat "${fixture}"; else printf '%s' "$*" > "${log}"; fi\n`);
    await chmod(script, 0o755);
    vi.stubEnv("PATH", dir);
    return log;
  }

  it("lists windows through wmctrl -lx", async () => {
    await fakeWmctrl();
    expect((await createWmctrl().list()).map((window) => window.title)).toContain("Friends List");
  });

  it("closes a window by id", async () => {
    const log = await fakeWmctrl();
    await createWmctrl().close("0x05000099");
    expect(await readFile(log, "utf8")).toBe("-i -c 0x05000099");
  });

  it.each(["", "05000099", "0x", "0xZZ", "0x1; rm -rf ~", "-1", "0x1 0x2"])("refuses to close %j without running wmctrl", async (id) => {
    const log = await fakeWmctrl();
    await expect(createWmctrl().close(id)).rejects.toThrow();
    expect(existsSync(log)).toBe(false);
  });

  it("rejects when wmctrl is not installed", async () => {
    vi.stubEnv("PATH", dir);
    await expect(createWmctrl().list()).rejects.toThrow(/ENOENT/);
  });
});
