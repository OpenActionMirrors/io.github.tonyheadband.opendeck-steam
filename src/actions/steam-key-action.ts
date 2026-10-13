import { SingletonAction, type DidReceiveSettingsEvent, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { activate, refreshIcon, type ControlSpec, type Deps, type Settings } from "../control.js";

export abstract class SteamKeyAction<V> extends SingletonAction<Settings> {
  constructor(
    protected readonly spec: ControlSpec<V>,
    protected readonly deps: Deps,
  ) {
    super();
  }

  async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
    if (ev.action.isKey()) await refreshIcon(this.spec, ev.payload.settings, ev.action, this.deps);
  }

  async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
    if (ev.action.isKey()) await refreshIcon(this.spec, ev.payload.settings, ev.action, this.deps);
  }

  onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
    return activate(this.spec, ev.payload.settings, ev.action, this.deps);
  }
}
