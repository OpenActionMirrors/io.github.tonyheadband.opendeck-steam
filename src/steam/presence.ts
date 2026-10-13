export type PresenceState = "ingame" | "online" | "busy" | "away" | "offline";

export interface PlayerSummary {
  steamId: string;
  name: string;
  personaState: number;
  gameId?: string;
  gameName?: string;
  avatarUrl?: string;
}

export interface FriendView {
  steamId: string;
  name: string;
  state: PresenceState;
  avatarUrl?: string;
  avatar?: Buffer;
  cameOnline?: true;
}

export type FriendUpdate =
  | { kind: "view"; view: FriendView }
  | { kind: "unknown" }
  | { kind: "nokey" }
  | { kind: "auth" };

export const STATE_COLORS: Record<PresenceState, string> = {
  ingame: "#3ddc84",
  online: "#4da3ff",
  busy: "#e5534b",
  away: "#f5a623",
  offline: "#5f6368",
};

// The API can leave stale game fields on an offline player, so offline is decided first.
export function stateOf(summary: Pick<PlayerSummary, "personaState" | "gameId" | "gameName">): PresenceState {
  if (summary.personaState === 0) return "offline";
  if (summary.gameId || summary.gameName) return "ingame";
  if (summary.personaState === 2) return "busy";
  if (summary.personaState === 3 || summary.personaState === 4) return "away";
  return "online";
}
