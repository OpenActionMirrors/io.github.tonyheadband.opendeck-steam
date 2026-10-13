import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createXdgOpen, xdgOpen } from "../src/steam/open.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "xdg-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

async function fakeXdgOpen(script: string) {
  const path = join(dir, "xdg-open");
  await writeFile(path, `#!/bin/sh\n${script}\n`);
  await chmod(path, 0o755);
  vi.stubEnv("PATH", dir);
}

describe("xdgOpen", () => {
  it("passes the uri as a single argument", async () => {
    const log = join(dir, "args.txt");
    await fakeXdgOpen(`printf '%s|%s' "$#" "$1" > "${log}"`);

    await xdgOpen("steam://open/games; echo pwned");

    expect(await readFile(log, "utf8")).toBe("1|steam://open/games; echo pwned");
  });

  it("rejects when xdg-open blocks past the timeout", async () => {
    await fakeXdgOpen("exec /bin/sleep 5");
    await expect(createXdgOpen(100)("steam://open/games")).rejects.toThrow();
  });

  it("rejects when xdg-open exits non-zero", async () => {
    await fakeXdgOpen("exit 3");
    await expect(xdgOpen("steam://open/games")).rejects.toThrow();
  });

  it("rejects when xdg-open is not installed", async () => {
    vi.stubEnv("PATH", dir);
    await expect(xdgOpen("steam://open/games")).rejects.toThrow(/ENOENT/);
  });
});
