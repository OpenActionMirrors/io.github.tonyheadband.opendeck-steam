import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The SDK logs every raw websocket frame at TRACE, and those frames carry the Steam API key
// (setGlobalSettings, sendToPlugin). The default level is info; nothing here may raise it.
describe("logging level", () => {
  it("never changes the SDK log level from src/", () => {
    const root = new URL("../src/", import.meta.url).pathname;
    const files = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => join(entry.parentPath, entry.name));

    expect(files.length).toBeGreaterThan(10);
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toMatch(/setLevel|LogLevel\.(TRACE|DEBUG)/);
  });
});
