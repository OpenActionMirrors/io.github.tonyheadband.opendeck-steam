import { describe, expect, it, vi } from "vitest";
import { createToggleOpener } from "../src/steam/toggle.js";
import type { SteamWindow, WindowControl } from "../src/steam/windows.js";

const FRIENDS = "steam://open/friends";
const friendsWindow: SteamWindow = { id: "0x05000099", className: "steamwebhelper.steam", title: "Friends List" };
const mainWindow: SteamWindow = { id: "0x05000043", className: "steamwebhelper.steam", title: "Steam" };

const CHAT = "steam://friends/message/76561198000000010";
const chatWindow: SteamWindow = { id: "0x05000155", className: "steamwebhelper.steam", title: "Alex" };

function setup(windows: SteamWindow[] | Error = [], friendName: (steamId: string) => string | undefined = () => undefined) {
  const open = vi.fn().mockResolvedValue(undefined);
  const control = {
    list: vi.fn(async () => {
      if (windows instanceof Error) throw windows;
      return windows;
    }),
    close: vi.fn().mockResolvedValue(undefined),
  } satisfies WindowControl;
  const logger = { error: vi.fn() };
  return { open, control, logger, toggle: createToggleOpener(open, control, logger, friendName) };
}

describe("createToggleOpener", () => {
  it("closes the open friends list instead of opening it", async () => {
    const { toggle, open, control } = setup([mainWindow, friendsWindow]);
    await toggle(FRIENDS);
    expect(control.close).toHaveBeenCalledExactlyOnceWith("0x05000099");
    expect(open).not.toHaveBeenCalled();
  });

  it("opens the friends list when it is not open", async () => {
    const { toggle, open, control } = setup([mainWindow]);
    await toggle(FRIENDS);
    expect(open).toHaveBeenCalledExactlyOnceWith(FRIENDS);
    expect(control.close).not.toHaveBeenCalled();
  });

  it("never closes the main Steam window for the friends view", async () => {
    const { toggle, control } = setup([mainWindow]);
    await toggle(FRIENDS);
    expect(control.close).not.toHaveBeenCalled();
  });

  it.each(["games", "account", "downloads", "settings"])("closes the main window on a second press of the %s view", async (view) => {
    const { toggle, open, control } = setup([mainWindow, friendsWindow]);
    await toggle(`steam://open/${view}`);
    expect(open).toHaveBeenCalledExactlyOnceWith(`steam://open/${view}`);
    expect(control.close).not.toHaveBeenCalled();
    await toggle(`steam://open/${view}`);
    expect(control.close).toHaveBeenCalledExactlyOnceWith("0x05000043");
    expect(open).toHaveBeenCalledOnce();
  });

  it("navigates the open main window to a different view instead of closing it", async () => {
    const { toggle, open, control } = setup([mainWindow]);
    await toggle("steam://open/games");
    await toggle("steam://open/downloads");
    expect(open).toHaveBeenNthCalledWith(2, "steam://open/downloads");
    expect(control.close).not.toHaveBeenCalled();
    await toggle("steam://open/downloads");
    expect(control.close).toHaveBeenCalledExactlyOnceWith("0x05000043");
  });

  it("opens again after the window was closed and the same view is pressed", async () => {
    const { toggle, open, control } = setup([mainWindow]);
    await toggle("steam://open/games");
    await toggle("steam://open/games");
    expect(control.close).toHaveBeenCalledOnce();
    await toggle("steam://open/games");
    expect(open).toHaveBeenCalledTimes(2);
  });

  it.each(["games", "settings"])("opens the %s view when the main window is not open", async (view) => {
    const { toggle, open, control } = setup([friendsWindow]);
    await toggle(`steam://open/${view}`);
    expect(open).toHaveBeenCalledExactlyOnceWith(`steam://open/${view}`);
    expect(control.close).not.toHaveBeenCalled();
  });

  it("ignores windows of other classes titled Steam", async () => {
    const { toggle, open, control } = setup([{ id: "0x9", className: "Navigator.firefox", title: "Steam" }]);
    await toggle("steam://open/games");
    expect(control.close).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalled();
  });

  it("opens and logs when wmctrl cannot list windows", async () => {
    const { toggle, open, logger } = setup(new Error("spawn wmctrl ENOENT"));
    await toggle(FRIENDS);
    expect(open).toHaveBeenCalledExactlyOnceWith(FRIENDS);
    expect(logger.error).toHaveBeenCalled();
  });

  it("opens and logs when closing fails", async () => {
    const { toggle, open, control, logger } = setup([friendsWindow]);
    control.close.mockRejectedValue(new Error("boom"));
    await toggle(FRIENDS);
    expect(open).toHaveBeenCalledExactlyOnceWith(FRIENDS);
    expect(logger.error).toHaveBeenCalled();
  });

  it("closes the friend's open chat window on a second press", async () => {
    const { toggle, open, control } = setup([mainWindow, chatWindow], () => "Alex");
    await toggle(CHAT);
    expect(control.close).toHaveBeenCalledExactlyOnceWith("0x05000155");
    expect(open).not.toHaveBeenCalled();
  });

  it("opens the chat when no window carries the friend's name", async () => {
    const { toggle, open, control } = setup([mainWindow], () => "Alex");
    await toggle(CHAT);
    expect(open).toHaveBeenCalledExactlyOnceWith(CHAT);
    expect(control.close).not.toHaveBeenCalled();
  });

  it("opens the chat without touching windows when the friend's name is unknown", async () => {
    const { toggle, open, control } = setup([chatWindow]);
    await toggle(CHAT);
    expect(open).toHaveBeenCalledExactlyOnceWith(CHAT);
    expect(control.list).not.toHaveBeenCalled();
  });

  it.each(["Steam", "Friends List", "  "])("never matches a friend named %j against Steam's own windows", async (name) => {
    const { toggle, open, control } = setup([mainWindow, friendsWindow], () => name);
    await toggle(CHAT);
    expect(open).toHaveBeenCalledExactlyOnceWith(CHAT);
    expect(control.close).not.toHaveBeenCalled();
  });

  it("ignores a same-titled window of another class", async () => {
    const { toggle, open, control } = setup([{ id: "0x9", className: "Navigator.firefox", title: "Alex" }], () => "Alex");
    await toggle(CHAT);
    expect(control.close).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledOnce();
  });

  it.each(["steam://rungameid/730", "steam://friends/status/away"])(
    "passes %s straight through without touching windows",
    async (uri) => {
      const { toggle, open, control } = setup([friendsWindow]);
      await toggle(uri);
      expect(open).toHaveBeenCalledExactlyOnceWith(uri);
      expect(control.list).not.toHaveBeenCalled();
    },
  );

  it("propagates an opener failure", async () => {
    const { toggle, open } = setup([]);
    open.mockRejectedValue(new Error("ENOENT"));
    await expect(toggle(FRIENDS)).rejects.toThrow();
  });
});
