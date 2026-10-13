import type { FriendsMessage } from "./friends-message.js";
import { isApiKey, type KeyStore } from "./key-store.js";

export interface PanelServices {
  keys: Pick<KeyStore, "set" | "clear">;
  friends(): Promise<FriendsMessage>;
  send(message: FriendsMessage): Promise<void>;
  logger: { error(...data: unknown[]): void };
}

// Failures are logged without the payload, because it may carry the API key.
export async function handlePanelMessage(payload: unknown, services: PanelServices): Promise<void> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return;
  const { event, apiKey } = payload as { event?: unknown; apiKey?: unknown };

  try {
    if (event === "setApiKey") {
      if (!isApiKey(apiKey)) {
        await services.send({
          ...(await services.friends()),
          error: "That does not look like a Steam Web API key (32 hex characters)",
        });
        return;
      }
      await services.keys.set(apiKey);
    } else if (event === "clearApiKey") {
      await services.keys.clear();
    } else if (event !== "getFriends") {
      return;
    }
    await services.send(await services.friends());
  } catch (error) {
    services.logger.error("Settings panel request failed", error instanceof Error ? error.message : "unknown error");
  }
}
