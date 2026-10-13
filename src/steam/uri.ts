export const STATUSES = ["online", "away", "invisible", "offline"] as const;
export const VIEWS = ["account", "downloads", "friends", "games", "settings"] as const;

export type Status = (typeof STATUSES)[number];
export type View = (typeof VIEWS)[number];

export const DEFAULT_STATUS: Status = "online";
export const DEFAULT_VIEW: View = "games";

export const ARTS = ["auto", "cover", "header", "logo"] as const;
export type Art = (typeof ARTS)[number];
export type ConcreteArt = Exclude<Art, "auto">;
export const DEFAULT_ART: Art = "auto";

// Unset means "never configured" (default); anything else must match the whitelist exactly.
function resolveFrom<T extends string>(allowed: readonly T[], fallback: T, value: unknown): T | undefined {
  if (value === undefined) return fallback;
  return allowed.find((candidate) => candidate === value);
}

export const resolveStatus = (value: unknown): Status | undefined => resolveFrom(STATUSES, DEFAULT_STATUS, value);
export const resolveView = (value: unknown): View | undefined => resolveFrom(VIEWS, DEFAULT_VIEW, value);
export const resolveArt = (value: unknown): Art | undefined => resolveFrom(ARTS, DEFAULT_ART, value);

export const MIN_SCALE = 20;
export const MAX_SCALE = 100;
export const DEFAULT_SCALE = 100;

// Percent of the tile the art fills; the panel's range input sends a string, hand edits may send a number.
export function resolveScale(value: unknown): number | undefined {
  if (value === undefined) return DEFAULT_SCALE;
  const scale = typeof value === "number" ? value : typeof value === "string" && /^[0-9]{1,3}$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(scale) && scale >= MIN_SCALE && scale <= MAX_SCALE ? scale : undefined;
}

export const isAppId = (value: unknown): value is string => typeof value === "string" && /^[0-9]{1,10}$/.test(value);

export const statusUri = (status: Status): string => `steam://friends/status/${status}`;
export const viewUri = (view: View): string => `steam://open/${view}`;
export const launchUri = (appId: string): string => `steam://rungameid/${appId}`;

export const isSteamId = (value: unknown): value is string => typeof value === "string" && /^[0-9]{17}$/.test(value);

export const chatUri = (steamId: string): string => `steam://friends/message/${steamId}`;

export const FLASH_VALUES = ["on", "off"] as const;
export type FlashSetting = (typeof FLASH_VALUES)[number];

export const resolveFlash = (value: unknown): FlashSetting | undefined => resolveFrom(FLASH_VALUES, "on", value);
