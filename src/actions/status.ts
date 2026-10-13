import { action } from "@elgato/streamdeck";
import { statusSpec, type Deps } from "../control.js";
import { STATUS_ACTION_UUID } from "../ids.js";
import type { Status } from "../steam/uri.js";
import { SteamKeyAction } from "./steam-key-action.js";

@action({ UUID: STATUS_ACTION_UUID })
export class SteamStatus extends SteamKeyAction<Status> {
  constructor(deps: Deps) {
    super(statusSpec, deps);
  }
}
