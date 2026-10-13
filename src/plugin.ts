import streamDeck from "@elgato/streamdeck";
import { SteamFriend } from "./actions/friend.js";
import { LaunchSteamGame } from "./actions/launch.js";
import { OpenSteamView } from "./actions/open-view.js";
import { SteamStatus } from "./actions/status.js";
import { createFriendSpec, createLaunchSpec, FRIEND_PLACEHOLDER_ICON, GENERIC_LAUNCH_ICON } from "./control.js";
import { iconForUpdate } from "./friend-icon.js";
import { buildFriendsMessage } from "./friends-message.js";
import { handlePanelMessage } from "./friends-panel.js";
import { buildGamesMessage } from "./games-message.js";
import { createIconLoader } from "./icons.js";
import { createKeyStore } from "./key-store.js";
import { memoize } from "./memo.js";
import { createPresencePoller } from "./presence-poller.js";
import { createRunningWatcher } from "./running-watcher.js";
import { withTimeout } from "./timeout.js";
import { readOwnAccount } from "./steam/accounts.js";
import { createGameIconLoader } from "./steam/art.js";
import { createAvatarLoader } from "./steam/avatar.js";
import { findSteamRoot } from "./steam/library.js";
import { xdgOpen } from "./steam/open.js";
import { listRunningAppIds } from "./steam/running.js";
import { createToggleOpener } from "./steam/toggle.js";
import { createSteamApi, type SteamApi } from "./steam/web-api.js";
import { createWmctrl } from "./steam/windows.js";

// The bundle lives in bin/, so ../imgs/ is the plugin's image folder.
const loadIcon = createIconLoader(new URL("../imgs/", import.meta.url));

const deps = {
  loadIcon,
  open: createToggleOpener(xdgOpen, createWmctrl(), streamDeck.logger, (steamId) => {
    const update = poller.latest(steamId);
    return update?.kind === "view" ? update.view.name : undefined;
  }),
  logger: streamDeck.logger,
};

const loadGameIcon = createGameIconLoader({
  steamRoot: () => findSteamRoot(),
  fallback: () => loadIcon(GENERIC_LAUNCH_ICON),
});

streamDeck.actions.registerAction(new SteamStatus(deps));
streamDeck.actions.registerAction(new OpenSteamView(deps));
// Every launch key's panel asks for the list at profile load; one scan serves them all.
const games = memoize(() => buildGamesMessage(() => findSteamRoot(), deps.logger), 5_000);

const watcher = createRunningWatcher({ scan: () => listRunningAppIds(), logger: deps.logger });

streamDeck.actions.registerAction(
  new LaunchSteamGame(
    createLaunchSpec(loadGameIcon, (appId) => watcher.isRunning(appId)),
    deps,
    games,
    watcher,
  ),
);

const poller = createPresencePoller({ loadAvatar: createAvatarLoader({ fetch }), logger: deps.logger });

let api: SteamApi | undefined;
const keys = createKeyStore(
  {
    getGlobalSettings: () => streamDeck.settings.getGlobalSettings(),
    setGlobalSettings: (value) => streamDeck.settings.setGlobalSettings(value),
  },
  (key) => {
    api = key ? createSteamApi({ key, fetch }) : undefined;
    friends.clear();
    poller.setApi(api);
  },
);

const placeholder = () => loadIcon(FRIEND_PLACEHOLDER_ICON);
// Opening the panel asks twice (on connect and on appear); cleared whenever the key changes.
const friends = memoize(
  () =>
    buildFriendsMessage({
      api,
      own: async () => {
        const root = await findSteamRoot();
        return root ? readOwnAccount(root) : undefined;
      },
      logger: deps.logger,
    }),
  2_000,
);
const panel = (payload: unknown) =>
  handlePanelMessage(payload, {
    keys,
    friends,
    send: (message) => streamDeck.ui.sendToPropertyInspector(message),
    logger: deps.logger,
  });

streamDeck.actions.registerAction(
  new SteamFriend(
    createFriendSpec((steamId) => iconForUpdate(poller.latest(steamId), placeholder)),
    deps,
    poller,
    placeholder,
    panel,
  ),
);

await streamDeck.connect();
// The log level must stay at info: TRACE would write the API key to the log (tests/no-trace-logging).
await withTimeout(keys.load(), 10_000, "Timed out loading the stored Steam API key").catch((error: unknown) =>
  deps.logger.error("Could not load the stored Steam API key", error),
);
