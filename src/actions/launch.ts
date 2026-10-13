import streamDeck, { action, SingletonAction, type DidReceiveSettingsEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { refreshIcon, type ControlSpec, type Deps, type LaunchValue, type Settings } from "../control.js";
import { pushGames, type GamesMessage } from "../games-message.js";
import { LAUNCH_ACTION_UUID } from "../ids.js";
import type { RunningWatcher } from "../running-watcher.js";
import { isAppId } from "../steam/uri.js";
import { SteamKeyAction } from "./steam-key-action.js";

// The SDK's event type is generic over a JSON type that is not exported from the package root.
type SendToPluginInput = Parameters<NonNullable<SingletonAction<Settings>["onSendToPlugin"]>>[0];
type AnyAction = WillAppearEvent<Settings>["action"];

@action({ UUID: LAUNCH_ACTION_UUID })
export class LaunchSteamGame extends SteamKeyAction<LaunchValue> {
  constructor(
    spec: ControlSpec<LaunchValue>,
    deps: Deps,
    private readonly games: () => Promise<GamesMessage>,
    private readonly watcher: RunningWatcher,
  ) {
    super(spec, deps);
  }

  override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
    this.track(ev.action, ev.payload.settings);
    await super.onWillAppear(ev);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
    this.track(ev.action, ev.payload.settings);
    await super.onDidReceiveSettings(ev);
  }

  onWillDisappear(ev: WillDisappearEvent<Settings>): void {
    this.watcher.unsubscribe(ev.action.id);
  }

  async onPropertyInspectorDidAppear(): Promise<void> {
    await pushGames(streamDeck.ui, this.games, this.deps.logger);
  }

  async onSendToPlugin(ev: SendToPluginInput): Promise<void> {
    const payload = ev.payload;
    if (typeof payload !== "object" || payload === null || Array.isArray(payload) || payload.event !== "getGames") {
      return;
    }

    await pushGames(streamDeck.ui, this.games, this.deps.logger);
  }

  private track(key: AnyAction, settings: Settings): void {
    if (!key.isKey()) return;

    const appId = isAppId(settings.appid) ? settings.appid : undefined;
    this.watcher.subscribe(key.id, appId, () => refreshIcon(this.spec, settings, key, this.deps));
  }
}
