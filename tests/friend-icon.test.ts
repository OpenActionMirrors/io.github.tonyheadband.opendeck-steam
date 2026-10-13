import { describe, expect, it, vi } from "vitest";
import { composeFriendIcon, iconForUpdate } from "../src/friend-icon.js";
import { STATE_COLORS, type PresenceState } from "../src/steam/presence.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const STATES = Object.keys(STATE_COLORS) as PresenceState[];

function svgOf(dataUri: string): string {
  expect(dataUri.startsWith("data:image/svg+xml;base64,")).toBe(true);
  return Buffer.from(dataUri.split(",")[1] ?? "", "base64").toString("utf8");
}

describe("composeFriendIcon", () => {
  it.each(STATES)("draws the %s ring in its colour", (state) => {
    expect(svgOf(composeFriendIcon(state, JPEG))).toContain(`stroke="${STATE_COLORS[state]}"`);
  });

  it("embeds a jpeg avatar clipped to a circle", () => {
    const svg = svgOf(composeFriendIcon("online", JPEG));
    expect(svg).toContain(`data:image/jpeg;base64,${JPEG.toString("base64")}`);
    expect(svg).toContain('clip-path="url(#avatar)"');
    expect(svg).toContain('<clipPath id="avatar">');
  });

  it("detects a png avatar", () => {
    expect(svgOf(composeFriendIcon("online", PNG))).toContain(`data:image/png;base64,${PNG.toString("base64")}`);
  });

  it("dims the avatar only when offline", () => {
    expect(svgOf(composeFriendIcon("offline", JPEG))).toContain('opacity="0.45"');
    for (const state of STATES.filter((candidate) => candidate !== "offline")) {
      expect(svgOf(composeFriendIcon(state, JPEG))).not.toContain("opacity");
    }
  });

  it("draws a silhouette instead of an image when there is no avatar", () => {
    const svg = svgOf(composeFriendIcon("ingame"));
    expect(svg).not.toContain("<image");
    expect(svg).toContain(`stroke="${STATE_COLORS.ingame}"`);
  });
});

describe("iconForUpdate", () => {
  const placeholder = vi.fn(async () => "data:image/svg+xml;base64,PLACEHOLDER");

  it("renders a friend view with its state and avatar", async () => {
    const svg = svgOf(
      await iconForUpdate({ kind: "view", view: { steamId: "1", name: "x", state: "away", avatar: JPEG } }, placeholder),
    );
    expect(svg).toContain(`stroke="${STATE_COLORS.away}"`);
    expect(svg).toContain(JPEG.toString("base64"));
    expect(placeholder).not.toHaveBeenCalled();
  });

  it("uses the placeholder for a missing key or a rejected key", async () => {
    expect(await iconForUpdate({ kind: "nokey" }, placeholder)).toBe("data:image/svg+xml;base64,PLACEHOLDER");
    expect(await iconForUpdate({ kind: "auth" }, placeholder)).toBe("data:image/svg+xml;base64,PLACEHOLDER");
  });

  it("shows the dimmed silhouette for an unknown friend or no data yet", async () => {
    for (const update of [{ kind: "unknown" } as const, undefined]) {
      const svg = svgOf(await iconForUpdate(update, placeholder));
      expect(svg).toContain(`stroke="${STATE_COLORS.offline}"`);
      expect(svg).not.toContain("<image");
    }
  });
});

describe("highlight frame", () => {
  const WHITE_RING = '<circle cx="72" cy="72" r="64" fill="none" stroke="#ffffff" stroke-width="8"/>';

  it.each(STATES)("adds only a white outer ring to the %s icon", (state) => {
    const normal = svgOf(composeFriendIcon(state, JPEG));
    const highlighted = svgOf(composeFriendIcon(state, JPEG, { highlight: true }));
    expect(highlighted).toContain(WHITE_RING);
    expect(normal).not.toContain("#ffffff");
    expect(highlighted.replace(WHITE_RING, "")).toBe(normal);
  });

  it("works without an avatar and is a valid data URI", () => {
    const uri = composeFriendIcon("online", undefined, { highlight: true });
    expect(uri.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(svgOf(uri)).toContain("#ffffff");
  });
});
