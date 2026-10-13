import type { Opener } from "./open.js";
import { VIEWS, viewUri } from "./uri.js";
import { findSteamWindow, FRIENDS_WINDOW_TITLE, MAIN_WINDOW_TITLE, type WindowControl } from "./windows.js";

// Each view URI toggles the one window it shows: the friends list has its own window, every
// other view lives in the main Steam window. Other URIs (launch, status, chat) are never toggled.
const TOGGLE_TITLES = new Map<string, string>(
  VIEWS.map((view) => [viewUri(view), view === "friends" ? FRIENDS_WINDOW_TITLE : MAIN_WINDOW_TITLE]),
);

export function createToggleOpener(open: Opener, windows: WindowControl, logger: { error(...data: unknown[]): void }): Opener {
  return async (uri) => {
    const title = TOGGLE_TITLES.get(uri);
    if (title !== undefined) {
      try {
        const target = await findSteamWindow(windows, title);
        if (target) {
          await windows.close(target.id);
          return;
        }
      } catch (error) {
        logger.error("Could not toggle the Steam window; opening it instead", error);
      }
    }
    await open(uri);
  };
}
