import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readOwnAccount } from "../src/steam/accounts.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "accounts-"));
  await mkdir(join(root, "config"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const write = (text: string) => writeFile(join(root, "config", "loginusers.vdf"), text);

describe("readOwnAccount", () => {
  it("picks the most recent account", async () => {
    await write(`"users" {
      "76561198000000001" { "AccountName" "a" "PersonaName" "Alice" "MostRecent" "0" }
      "76561198000000002" { "AccountName" "b" "PersonaName" "Bob" "MostRecent" "1" }
    }`);
    expect(await readOwnAccount(root)).toEqual({ steamId: "76561198000000002", name: "Bob" });
  });

  it("falls back to the first valid account when none is marked most recent", async () => {
    await write(`"users" {
      "not-an-id" { "PersonaName" "Skip" }
      "76561198000000001" { "PersonaName" "Alice" "MostRecent" "0" }
    }`);
    expect(await readOwnAccount(root)).toEqual({ steamId: "76561198000000001", name: "Alice" });
  });

  it("uses a default name when the persona name is missing", async () => {
    await write(`"users" { "76561198000000001" { "MostRecent" "1" } }`);
    expect(await readOwnAccount(root)).toEqual({ steamId: "76561198000000001", name: "Me" });
  });

  it("returns undefined for a missing, garbage or empty file", async () => {
    expect(await readOwnAccount(root)).toBeUndefined();
    await write("not vdf");
    expect(await readOwnAccount(root)).toBeUndefined();
    await write(`"users" { }`);
    expect(await readOwnAccount(root)).toBeUndefined();
  });
});
