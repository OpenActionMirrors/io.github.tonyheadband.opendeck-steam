import type { Opener } from "./open.js";
import { VIEWS, viewUri } from "./uri.js";
import { findSteamWindow, FRIENDS_WINDOW_TITLE, MAIN_WINDOW_TITLE, type WindowControl } from "./windows.js";

// The friends list has its own window and toggles on its own. Every other view lives in the main
// Steam window, which cannot tell us which page it shows, so a press closes it only when this view
// was the last one opened here; a different view navigates the open window instead.
// A friend's chat window is titled with the friend's name, so a chat URI toggles only when the name
// is known and cannot be mistaken for another Steam window. Launch and status URIs are never toggled.
const CHAT_URI = /^steam:\/\/friends\/message\/(\d{17})$/;
const RESERVED_TITLES = new Set([MAIN_WINDOW_TITLE, FRIENDS_WINDOW_TITLE]);
const TOGGLE_TITLES = new Map<string, string>(
  VIEWS.map((view) => [viewUri(view), view === "friends" ? FRIENDS_WINDOW_TITLE : MAIN_WINDOW_TITLE]),
);

export function createToggleOpener(
  open: Opener,
  windows: WindowControl,
  logger: { error(...data: unknown[]): void },
  friendName: (steamId: string) => string | undefined = () => undefined,
): Opener {
  let lastMainView: string | undefined;

  const chatTitle = (uri: string): string | undefined => {
    const steamId = CHAT_URI.exec(uri)?.[1];
    const name = steamId === undefined ? undefined : friendName(steamId)?.trim();
    return name && !RESERVED_TITLES.has(name) ? name : undefined;
  };

  return async (uri) => {
    const title = TOGGLE_TITLES.get(uri) ?? chatTitle(uri);
    const sharesMainWindow = title === MAIN_WINDOW_TITLE;
    if (title !== undefined) {
      try {
        const target = await findSteamWindow(windows, title);
        if (target && (!sharesMainWindow || lastMainView === uri)) {
          await windows.close(target.id);
          if (sharesMainWindow) lastMainView = undefined;
          return;
        }
      } catch (error) {
        logger.error("Could not toggle the Steam window; opening it instead", error);
      }
    }
    await open(uri);
    if (sharesMainWindow) lastMainView = uri;
  };
}
