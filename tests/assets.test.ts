import { describe, expect, it } from "vitest";
import { FRIEND_PLACEHOLDER_ICON, GENERIC_LAUNCH_ICON, statusSpec, viewSpec, type Deps } from "../src/control.js";
import { createIconLoader } from "../src/icons.js";
import { STATUSES, VIEWS } from "../src/steam/uri.js";

const loadIcon = createIconLoader(new URL("../io.github.tonyheadband.opendeck-steam.sdPlugin/imgs/", import.meta.url));
const deps: Deps = { loadIcon, open: async () => {}, logger: { error() {}, info() {} } };

const svgOf = (dataUri: string) => Buffer.from(dataUri.split(",")[1] ?? "", "base64").toString("utf8");

describe("shipped artwork", () => {
  it.each(STATUSES)("status icon %s loads and is an svg", async (status) => {
    expect(svgOf(await statusSpec.icon(status, deps))).toMatch(/^<svg /);
  });

  it.each(VIEWS)("view icon %s loads and is an svg", async (view) => {
    expect(svgOf(await viewSpec.icon(view, deps))).toMatch(/^<svg /);
  });

  it("generic launch icon loads and is an svg", async () => {
    expect(svgOf(await loadIcon(GENERIC_LAUNCH_ICON))).toMatch(/^<svg /);
  });

  it("friend placeholder icon loads and is an svg", async () => {
    expect(svgOf(await loadIcon(FRIEND_PLACEHOLDER_ICON))).toMatch(/^<svg /);
  });
});
