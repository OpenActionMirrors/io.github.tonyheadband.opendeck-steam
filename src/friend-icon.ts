import { STATE_COLORS, type FriendUpdate, type PresenceState } from "./steam/presence.js";

const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 144 144">';

const SILHOUETTE =
  '<circle cx="72" cy="72" r="52" fill="#2a475e"/><circle cx="72" cy="60" r="18" fill="#5f7384"/><path d="M38 106c0-20 15-32 34-32s34 12 34 32" fill="#5f7384"/>';

const mimeOf = (bytes: Buffer): string => (bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : "image/jpeg");

const HIGHLIGHT_RING = '<circle cx="72" cy="72" r="64" fill="none" stroke="#ffffff" stroke-width="8"/>';

export function composeFriendIcon(state: PresenceState, avatar?: Buffer, options?: { highlight?: boolean }): string {
  const dim = state === "offline" ? ' opacity="0.45"' : "";
  const picture = avatar
    ? `<image x="20" y="20" width="104" height="104" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar)"${dim} xlink:href="data:${mimeOf(avatar)};base64,${avatar.toString("base64")}"/>`
    : `<g clip-path="url(#avatar)"${dim}>${SILHOUETTE}</g>`;

  const svg =
    `${SVG_OPEN}<defs><clipPath id="avatar"><circle cx="72" cy="72" r="52"/></clipPath></defs>` +
    `<rect width="144" height="144" rx="20" fill="#1b2838"/>${picture}${options?.highlight ? HIGHLIGHT_RING : ""}` +
    `<circle cx="72" cy="72" r="58" fill="none" stroke="${STATE_COLORS[state]}" stroke-width="8"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function iconForUpdate(update: FriendUpdate | undefined, placeholder: () => Promise<string>): Promise<string> {
  if (update?.kind === "view") return composeFriendIcon(update.view.state, update.view.avatar);
  if (update?.kind === "nokey" || update?.kind === "auth") return placeholder();
  return composeFriendIcon("offline");
}
