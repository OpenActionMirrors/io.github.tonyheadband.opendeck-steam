import { action } from "@elgato/streamdeck";
import { viewSpec, type Deps } from "../control.js";
import { OPENVIEW_ACTION_UUID } from "../ids.js";
import type { View } from "../steam/uri.js";
import { SteamKeyAction } from "./steam-key-action.js";

@action({ UUID: OPENVIEW_ACTION_UUID })
export class OpenSteamView extends SteamKeyAction<View> {
  constructor(deps: Deps) {
    super(viewSpec, deps);
  }
}
