import { describe, expect, it, vi } from "vitest";
import { createToggleOpener } from "../src/steam/toggle.js";
import type { SteamWindow, WindowControl } from "../src/steam/windows.js";

const FRIENDS = "steam://open/friends";
const friendsWindow: SteamWindow = { id: "0x05000099", className: "steamwebhelper.steam", title: "Friends List" };
const mainWindow: SteamWindow = { id: "0x05000043", className: "steamwebhelper.steam", title: "Steam" };

function setup(windows: SteamWindow[] | Error = []) {
  const open = vi.fn().mockResolvedValue(undefined);
  const control = {
    list: vi.fn(async () => {
      if (windows instanceof Error) throw windows;
      return windows;
    }),
    close: vi.fn().mockResolvedValue(undefined),
  } satisfies WindowControl;
  const logger = { error: vi.fn() };
  return { open, control, logger, toggle: createToggleOpener(open, control, logger) };
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

  it.each(["games", "account", "downloads", "settings"])("closes the open main window for the %s view", async (view) => {
    const { toggle, open, control } = setup([mainWindow, friendsWindow]);
    await toggle(`steam://open/${view}`);
    expect(control.close).toHaveBeenCalledExactlyOnceWith("0x05000043");
    expect(open).not.toHaveBeenCalled();
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

  it.each(["steam://rungameid/730", "steam://friends/status/away", "steam://friends/message/76561198000000001"])(
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
