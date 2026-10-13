import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createIconLoader } from "../src/icons.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "icons-"));
  await mkdir(join(dir, "a"));
  await writeFile(join(dir, "a", "b.svg"), "<svg/>");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const baseOf = (path: string) => pathToFileURL(`${path}/`);

describe("createIconLoader", () => {
  it("returns an svg data URI of the file contents", async () => {
    const load = createIconLoader(baseOf(dir));
    expect(await load("a/b.svg")).toBe(`data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`);
  });

  it("caches by relative path", async () => {
    const load = createIconLoader(baseOf(dir));
    const first = await load("a/b.svg");
    await rm(join(dir, "a", "b.svg"));
    expect(await load("a/b.svg")).toBe(first);
  });

  it("rejects when the file is missing", async () => {
    const load = createIconLoader(baseOf(dir));
    await expect(load("a/missing.svg")).rejects.toThrow();
  });
});
