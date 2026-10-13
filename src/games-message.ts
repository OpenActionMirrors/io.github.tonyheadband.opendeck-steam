import type { Deps } from "./control.js";
import { listInstalledGames } from "./steam/library.js";
import type { ConcreteArt } from "./steam/uri.js";

export type GamesMessage = {
  event: "games";
  steamFound: boolean;
  games: { appId: string; name: string; art: ConcreteArt[] }[];
};

export async function buildGamesMessage(
  steamRoot: () => Promise<string | undefined>,
  logger: Deps["logger"],
): Promise<GamesMessage> {
  const root = await steamRoot();
  if (root === undefined) return { event: "games", steamFound: false, games: [] };

  const games = await listInstalledGames(root, logger);
  return {
    event: "games",
    steamFound: true,
    games: games.map(({ appId, name, art }) => ({ appId, name, art })),
  };
}

// The SDK only delivers to the panel that is currently showing, and OpenDeck builds panels at
// profile load, so this runs both when a panel asks and when one appears.
export async function pushGames(
  ui: { sendToPropertyInspector(payload: GamesMessage): Promise<void> },
  games: () => Promise<GamesMessage>,
  logger: Deps["logger"],
): Promise<void> {
  try {
    await ui.sendToPropertyInspector(await games());
  } catch (error) {
    logger.error("Could not send the game list to the settings panel", error);
  }
}
