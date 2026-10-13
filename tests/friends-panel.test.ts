import { describe, expect, it, vi } from "vitest";
import type { FriendsMessage } from "../src/friends-message.js";
import { handlePanelMessage } from "../src/friends-panel.js";

const KEY = "0123456789abcdef0123456789abcdef";
const base: FriendsMessage = { event: "friends", hasKey: true, me: null, friends: [] };

function services() {
  return {
    keys: { set: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined) },
    friends: vi.fn(async () => base),
    send: vi.fn().mockResolvedValue(undefined),
    logger: { error: vi.fn() },
  };
}

describe("handlePanelMessage", () => {
  it("answers getFriends with the friends message", async () => {
    const s = services();
    await handlePanelMessage({ event: "getFriends" }, s);
    expect(s.send).toHaveBeenCalledExactlyOnceWith(base);
    expect(s.keys.set).not.toHaveBeenCalled();
  });

  it("stores a valid key, then sends fresh friends", async () => {
    const s = services();
    await handlePanelMessage({ event: "setApiKey", apiKey: KEY }, s);
    expect(s.keys.set).toHaveBeenCalledExactlyOnceWith(KEY);
    expect(s.send).toHaveBeenCalledExactlyOnceWith(base);
  });

  it.each(["short", "", `${KEY}0`, 5, null, undefined])("refuses %j and reports an error without storing", async (apiKey) => {
    const s = services();
    await handlePanelMessage({ event: "setApiKey", apiKey }, s);
    expect(s.keys.set).not.toHaveBeenCalled();
    expect(s.send).toHaveBeenCalledExactlyOnceWith({
      ...base,
      error: "That does not look like a Steam Web API key (32 hex characters)",
    });
  });

  it("clears the key, then sends fresh friends", async () => {
    const s = services();
    await handlePanelMessage({ event: "clearApiKey" }, s);
    expect(s.keys.clear).toHaveBeenCalledTimes(1);
    expect(s.send).toHaveBeenCalledTimes(1);
  });

  it.each([null, undefined, "getFriends", 5, [], {}, { event: "unknown" }, { event: 5 }])("ignores %j", async (payload) => {
    const s = services();
    await handlePanelMessage(payload, s);
    expect(s.send).not.toHaveBeenCalled();
    expect(s.keys.set).not.toHaveBeenCalled();
    expect(s.keys.clear).not.toHaveBeenCalled();
  });

  it("logs and does not throw when something fails, and never logs the key", async () => {
    const s = services();
    s.keys.set.mockRejectedValue(new Error("disk full"));
    await expect(handlePanelMessage({ event: "setApiKey", apiKey: KEY }, s)).resolves.toBeUndefined();
    expect(s.logger.error).toHaveBeenCalled();
    expect(JSON.stringify(s.logger.error.mock.calls)).not.toContain(KEY);
  });
});
