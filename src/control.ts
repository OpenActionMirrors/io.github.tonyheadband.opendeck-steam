import type { IconLoader } from "./icons.js";
import type { GameIconLoader } from "./steam/art.js";
import type { Opener } from "./steam/open.js";
import {
  chatUri,
  isAppId,
  isSteamId,
  launchUri,
  resolveArt,
  resolveFlash,
  resolveScale,
  resolveStatus,
  resolveView,
  statusUri,
  viewUri,
  type Art,
  type Status,
  type View,
} from "./steam/uri.js";

export type Settings = { status?: string; openview?: string; appid?: string; art?: string; steamid?: string; flash?: string; scale?: string | number };

export interface KeyLike {
  setImage(image?: string): Promise<void>;
  showAlert(): Promise<void>;
}

export interface Deps {
  loadIcon: IconLoader;
  open: Opener;
  logger: { error(...data: unknown[]): void; info(...data: unknown[]): void };
}

export type Resolution<V> =
  | { kind: "ok"; value: V }
  | { kind: "unset" }
  | { kind: "invalid"; setting: keyof Settings; raw: unknown };

export interface ControlSpec<V> {
  resolve(settings: Settings): Resolution<V>;
  icon(value: V, deps: Deps): Promise<string>;
  uri(value: V): string;
  unsetIcon?(deps: Deps): Promise<string>;
}

function whitelisted<V>(setting: "status" | "openview", resolve: (value: unknown) => V | undefined) {
  return (settings: Settings): Resolution<V> => {
    const raw = settings[setting];
    const value = resolve(raw);
    return value === undefined ? { kind: "invalid", setting, raw } : { kind: "ok", value };
  };
}

export const statusSpec: ControlSpec<Status> = {
  resolve: whitelisted("status", resolveStatus),
  icon: (status, deps) => deps.loadIcon(`actions/status/${status}.svg`),
  uri: statusUri,
};

export const viewSpec: ControlSpec<View> = {
  resolve: whitelisted("openview", resolveView),
  icon: (view, deps) => deps.loadIcon(`actions/openview/${view}.svg`),
  uri: viewUri,
};

export interface LaunchValue {
  appId: string;
  art: Art;
  scale: number;
}

export const GENERIC_LAUNCH_ICON = "actions/launch/generic.svg";

export function createLaunchSpec(
  loadGameIcon: GameIconLoader,
  isRunning: (appId: string) => boolean = () => false,
): ControlSpec<LaunchValue> {
  return {
    resolve(settings) {
      const art = resolveArt(settings.art);
      if (art === undefined) return { kind: "invalid", setting: "art", raw: settings.art };
      const scale = resolveScale(settings.scale);
      if (scale === undefined) return { kind: "invalid", setting: "scale", raw: settings.scale };
      if (settings.appid === undefined) return { kind: "unset" };
      if (!isAppId(settings.appid)) return { kind: "invalid", setting: "appid", raw: settings.appid };
      return { kind: "ok", value: { appId: settings.appid, art, scale } };
    },
    icon: (value) => loadGameIcon(value.appId, value.art, { running: isRunning(value.appId), scale: value.scale }),
    uri: (value) => launchUri(value.appId),
    unsetIcon: (deps) => deps.loadIcon(GENERIC_LAUNCH_ICON),
  };
}

export const FRIEND_PLACEHOLDER_ICON = "actions/friend/placeholder.svg";

export function createFriendSpec(render: (steamId: string) => Promise<string>): ControlSpec<string> {
  return {
    resolve(settings) {
      if (resolveFlash(settings.flash) === undefined) return { kind: "invalid", setting: "flash", raw: settings.flash };
      if (settings.steamid === undefined) return { kind: "unset" };
      if (!isSteamId(settings.steamid)) return { kind: "invalid", setting: "steamid", raw: settings.steamid };
      return { kind: "ok", value: settings.steamid };
    },
    icon: (steamId) => render(steamId),
    uri: chatUri,
    unsetIcon: (deps) => deps.loadIcon(FRIEND_PLACEHOLDER_ICON),
  };
}

// An unhandled rejection would kill the plugin process, so every failure ends in a key alert.
async function run<V>(
  spec: ControlSpec<V>,
  settings: Settings,
  key: KeyLike,
  deps: Deps,
  handlers: { ok(value: V): Promise<void>; unset(): Promise<void> },
): Promise<void> {
  const alert = async () => {
    try {
      await key.showAlert();
    } catch (error) {
      deps.logger.error("Could not show the key alert", error);
    }
  };

  // The host can send null settings for a key that was never configured.
  const resolution = spec.resolve(settings ?? {});

  if (resolution.kind === "invalid") {
    deps.logger.error(`Invalid ${resolution.setting} setting: ${JSON.stringify(resolution.raw)?.slice(0, 100)}`);
    await alert();
    return;
  }

  try {
    if (resolution.kind === "unset") await handlers.unset();
    else await handlers.ok(resolution.value);
  } catch (error) {
    deps.logger.error("Key action failed", error);
    await alert();
  }
}

export const refreshIcon = <V>(spec: ControlSpec<V>, settings: Settings, key: KeyLike, deps: Deps) =>
  run(spec, settings, key, deps, {
    ok: async (value) => key.setImage(await spec.icon(value, deps)),
    unset: async () => {
      if (spec.unsetIcon) await key.setImage(await spec.unsetIcon(deps));
    },
  });

export const activate = <V>(spec: ControlSpec<V>, settings: Settings, key: KeyLike, deps: Deps) =>
  run(spec, settings, key, deps, {
    ok: (value) => deps.open(spec.uri(value)),
    unset: async () => {
      deps.logger.info("Key pressed before it was configured");
      await key.showAlert();
    },
  });
