import { action, type DidReceiveSettingsEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { type ControlSpec, type Deps, type KeyLike, type Settings } from "../control.js";
import { runFlash } from "../flash.js";
import { composeFriendIcon, iconForUpdate } from "../friend-icon.js";
import { FRIEND_ACTION_UUID } from "../ids.js";
import type { PresencePoller } from "../presence-poller.js";
import type { FriendView } from "../steam/presence.js";
import { isSteamId, resolveFlash } from "../steam/uri.js";
import { SteamKeyAction } from "./steam-key-action.js";

// Both events carry the same action union; `isKey()` narrows it to something with setImage.
type AnyAction = WillAppearEvent<Settings>["action"];

// The SDK's event type is generic over a JSON type that is not exported from the package root.
type SendToPluginInput = Parameters<NonNullable<SteamKeyAction<string>["onSendToPlugin"]>>[0];

@action({ UUID: FRIEND_ACTION_UUID })
export class SteamFriend extends SteamKeyAction<string> {
  private readonly flashes = new Map<string, () => void>();

  constructor(
    spec: ControlSpec<string>,
    deps: Deps,
    private readonly poller: PresencePoller,
    private readonly placeholder: () => Promise<string>,
    private readonly panel: (payload: unknown) => Promise<void>,
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
    this.cancelFlash(ev.action.id);
    this.poller.unsubscribe(ev.action.id);
  }

  async onPropertyInspectorDidAppear(): Promise<void> {
    await this.panel({ event: "getFriends" });
  }

  async onSendToPlugin(ev: SendToPluginInput): Promise<void> {
    await this.panel(ev.payload);
  }

  private cancelFlash(id: string): void {
    this.flashes.get(id)?.();
    this.flashes.delete(id);
  }

  private startFlash(key: KeyLike & { id: string }, view: FriendView): void {
    this.flashes.set(
      key.id,
      runFlash(
        {
          normal: composeFriendIcon(view.state, view.avatar),
          highlight: composeFriendIcon(view.state, view.avatar, { highlight: true }),
        },
        (image) => key.setImage(image),
        (error) => this.deps.logger.error("Could not redraw friend key", error),
      ),
    );
  }

  private track(key: AnyAction, settings: Settings): void {
    if (!key.isKey()) return;

    this.cancelFlash(key.id);
    const flash = resolveFlash(settings.flash);
    const steamId = flash !== undefined && isSteamId(settings.steamid) ? settings.steamid : undefined;
    const flashOn = flash === "on";

    this.poller.subscribe(key.id, steamId, async (update) => {
      try {
        this.cancelFlash(key.id);
        if (flashOn && update.kind === "view" && update.view.cameOnline) {
          this.startFlash(key, update.view);
          return;
        }
        await key.setImage(await iconForUpdate(update, this.placeholder));
      } catch (error) {
        this.deps.logger.error("Could not redraw friend key", error);
      }
    });
  }
}
