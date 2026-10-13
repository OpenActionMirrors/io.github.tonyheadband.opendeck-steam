import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { FRIEND_ACTION_UUID, LAUNCH_ACTION_UUID, OPENVIEW_ACTION_UUID, PLUGIN_UUID, STATUS_ACTION_UUID } from "../src/ids.js";

const root = new URL("../io.github.tonyheadband.opendeck-steam.sdPlugin/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));

describe("manifest.json", () => {
  it("matches the ids used in code", () => {
    expect(manifest.UUID).toBe(PLUGIN_UUID);
    expect(manifest.Actions.map((a: { UUID: string }) => a.UUID)).toEqual([STATUS_ACTION_UUID, OPENVIEW_ACTION_UUID, LAUNCH_ACTION_UUID, FRIEND_ACTION_UUID]);
  });

  it("is named Steam Dashboard Controller", () => {
    expect(manifest.Name).toBe("Steam Dashboard Controller");
  });

  it("targets linux only, Keypad only, SDK 2, Node 20", () => {
    expect(manifest.OS.map((o: { Platform: string }) => o.Platform)).toEqual(["linux"]);
    expect(manifest.SDKVersion).toBe(2);
    expect(manifest.Nodejs.Version).toBe("20");
    expect(manifest.CodePath).toBe("bin/plugin.js");
    for (const a of manifest.Actions) expect(a.Controllers).toEqual(["Keypad"]);
  });

  it("requires Stream Deck software 7.1+, which SDK 3 demands for settings events", () => {
    const [major = 0, minor = 0] = manifest.Software.MinimumVersion.split(".").map(Number);
    expect(major * 100 + minor).toBeGreaterThanOrEqual(701);
  });

  it("references icons that exist (extension-less, resolved as .svg by OpenDeck)", () => {
    const icons: string[] = [
      manifest.Icon,
      manifest.CategoryIcon,
      ...manifest.Actions.flatMap((a: { Icon: string; States: { Image: string }[] }) => [a.Icon, ...a.States.map((s) => s.Image)]),
    ];
    for (const icon of icons) {
      expect(icon).not.toMatch(/\.(png|svg)$/);
      expect(existsSync(new URL(`${icon}.svg`, root)), icon).toBe(true);
    }
  });

  it("references property inspectors that exist", () => {
    for (const a of manifest.Actions) expect(existsSync(new URL(a.PropertyInspectorPath, root))).toBe(true);
  });
});
