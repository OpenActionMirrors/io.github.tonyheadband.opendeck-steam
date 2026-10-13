import { describe, expect, it, vi } from "vitest";
import { STATUSES, VIEWS } from "../src/steam/uri.js";
import { activate, createFriendSpec, createLaunchSpec, refreshIcon, statusSpec, viewSpec, type Deps, type KeyLike, type Settings } from "../src/control.js";

function setup(overrides: Partial<Deps> = {}) {
  const key = {
    setImage: vi.fn().mockResolvedValue(undefined),
    showAlert: vi.fn().mockResolvedValue(undefined),
  } satisfies KeyLike;
  const deps = {
    loadIcon: vi.fn(async (path: string) => `data:image/svg+xml;base64,${Buffer.from(path).toString("base64")}`),
    open: vi.fn().mockResolvedValue(undefined),
    logger: { error: vi.fn(), info: vi.fn() },
    ...overrides,
  } satisfies Deps;
  return { key, deps };
}

describe("refreshIcon", () => {
  it.each(STATUSES)("sets exactly one data URI icon for status %s", async (status) => {
    const { key, deps } = setup();
    await refreshIcon(statusSpec, { status }, key, deps);

    expect(deps.loadIcon).toHaveBeenCalledWith(`actions/status/${status}.svg`);
    expect(key.setImage).toHaveBeenCalledTimes(1);
    expect(key.setImage.mock.calls[0]?.[0]).toMatch(/^data:/);
    expect(key.showAlert).not.toHaveBeenCalled();
  });

  it.each(VIEWS)("sets the icon for view %s", async (openview) => {
    const { key, deps } = setup();
    await refreshIcon(viewSpec, { openview }, key, deps);
    expect(deps.loadIcon).toHaveBeenCalledWith(`actions/openview/${openview}.svg`);
    expect(key.setImage).toHaveBeenCalledTimes(1);
  });

  it("uses the defaults for empty settings", async () => {
    const a = setup();
    await refreshIcon(statusSpec, {}, a.key, a.deps);
    expect(a.deps.loadIcon).toHaveBeenCalledWith("actions/status/online.svg");

    const b = setup();
    await refreshIcon(viewSpec, {}, b.key, b.deps);
    expect(b.deps.loadIcon).toHaveBeenCalledWith("actions/openview/games.svg");
  });

  it.each([
    ["status", statusSpec, { status: "downloads; rm -rf ~" }],
    ["status", statusSpec, { status: "games" }],
    ["openview", viewSpec, { openview: "online" }],
    ["openview", viewSpec, { openview: "" }],
    ["openview", viewSpec, { openview: 5 as unknown as string }],
  ] as const)("alerts and sets no icon for invalid %s setting %j", async (_name, spec, settings) => {
    const { key, deps } = setup();
    await refreshIcon(spec as never, settings, key, deps);

    expect(key.showAlert).toHaveBeenCalledTimes(1);
    expect(key.setImage).not.toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalled();
  });

  it("alerts and logs, without throwing, when the icon file is missing", async () => {
    const { key, deps } = setup({ loadIcon: vi.fn().mockRejectedValue(new Error("ENOENT")) });
    await expect(refreshIcon(statusSpec, { status: "away" }, key, deps)).resolves.toBeUndefined();

    expect(key.showAlert).toHaveBeenCalledTimes(1);
    expect(key.setImage).not.toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalled();
  });

  it("never passes a non-data string to setImage", async () => {
    const { key, deps } = setup();
    for (const status of STATUSES) await refreshIcon(statusSpec, { status }, key, deps);
    for (const openview of VIEWS) await refreshIcon(viewSpec, { openview }, key, deps);

    for (const [image] of key.setImage.mock.calls) expect(image).toMatch(/^data:/);
  });
});

describe("activate", () => {
  it.each(STATUSES)("opens the status uri for %s", async (status) => {
    const { key, deps } = setup();
    await activate(statusSpec, { status }, key, deps);
    expect(deps.open).toHaveBeenCalledExactlyOnceWith(`steam://friends/status/${status}`);
    expect(key.showAlert).not.toHaveBeenCalled();
  });

  it.each(VIEWS)("opens the view uri for %s", async (openview) => {
    const { key, deps } = setup();
    await activate(viewSpec, { openview }, key, deps);
    expect(deps.open).toHaveBeenCalledExactlyOnceWith(`steam://open/${openview}`);
  });

  it("opens the default uris for empty settings", async () => {
    const a = setup();
    await activate(statusSpec, {}, a.key, a.deps);
    expect(a.deps.open).toHaveBeenCalledExactlyOnceWith("steam://friends/status/online");

    const b = setup();
    await activate(viewSpec, {}, b.key, b.deps);
    expect(b.deps.open).toHaveBeenCalledExactlyOnceWith("steam://open/games");
  });

  it("does not open anything for hostile or cross-action values", async () => {
    for (const [spec, settings] of [
      [viewSpec, { openview: "downloads; rm -rf ~" }],
      [viewSpec, { openview: "../x" }],
      [statusSpec, { status: "games" }],
    ] as const) {
      const { key, deps } = setup();
      await activate(spec as never, settings, key, deps);
      expect(deps.open).not.toHaveBeenCalled();
      expect(key.showAlert).toHaveBeenCalledTimes(1);
    }
  });

  it("alerts and logs, without throwing, when xdg-open fails", async () => {
    const { key, deps } = setup({ open: vi.fn().mockRejectedValue(new Error("ENOENT")) });
    await expect(activate(statusSpec, { status: "away" }, key, deps)).resolves.toBeUndefined();

    expect(key.showAlert).toHaveBeenCalledTimes(1);
    expect(deps.logger.error).toHaveBeenCalled();
  });
});

describe("defensive run()", () => {
  it("treats null settings as empty instead of throwing", async () => {
    const { key, deps } = setup();
    await expect(refreshIcon(statusSpec, null as unknown as Settings, key, deps)).resolves.toBeUndefined();
    expect(key.setImage).toHaveBeenCalledTimes(1);
  });

  it("survives a throwing showAlert on an invalid setting and on a failing action", async () => {
    const { key, deps } = setup();
    key.showAlert.mockRejectedValue(new Error("no key"));

    await expect(refreshIcon(statusSpec, { status: "bogus" }, key, deps)).resolves.toBeUndefined();
    const failing = createLaunchSpec(vi.fn().mockRejectedValue(new Error("boom")));
    await expect(refreshIcon(failing, { appid: "1" }, key, deps)).resolves.toBeUndefined();
    expect(deps.logger.error).toHaveBeenCalled();
  });
});

describe("launch spec", () => {
  const loadGameIcon = vi.fn(
    async (appId: string, art: string) => `data:image/svg+xml;base64,${Buffer.from(`${appId}/${art}`).toString("base64")}`,
  );
  const launchSpec = createLaunchSpec(loadGameIcon);

  it("shows the game's art for a valid appid and defaults art to auto", async () => {
    loadGameIcon.mockClear();
    const { key, deps } = setup();
    await refreshIcon(launchSpec, { appid: "250820" }, key, deps);

    expect(loadGameIcon).toHaveBeenCalledWith("250820", "auto", { running: false, scale: 100 });
    expect(key.setImage).toHaveBeenCalledTimes(1);
    expect(key.setImage.mock.calls[0]?.[0]).toMatch(/^data:/);
    expect(key.showAlert).not.toHaveBeenCalled();
  });

  it("passes the chosen scale through, as a number or a numeric string", async () => {
    const { key, deps } = setup();
    await refreshIcon(launchSpec, { appid: "1", scale: "70" }, key, deps);
    expect(loadGameIcon).toHaveBeenLastCalledWith("1", "auto", { running: false, scale: 70 });
    await refreshIcon(launchSpec, { appid: "1", scale: 45 }, key, deps);
    expect(loadGameIcon).toHaveBeenLastCalledWith("1", "auto", { running: false, scale: 45 });
  });

  it.each(["0", "19", "101", "-5", "70.5", "abc", "", "1e2", 150, 12.5, null, true, {}])(
    "rejects scale %j: alert, no icon, nothing opened",
    async (scale) => {
      const refresh = setup();
      await refreshIcon(launchSpec, { appid: "1", scale: scale as unknown as string }, refresh.key, refresh.deps);
      expect(refresh.key.showAlert).toHaveBeenCalledTimes(1);
      expect(refresh.key.setImage).not.toHaveBeenCalled();

      const press = setup();
      await activate(launchSpec, { appid: "1", scale: scale as unknown as string }, press.key, press.deps);
      expect(press.deps.open).not.toHaveBeenCalled();
    },
  );

  it("asks for the ring only for a game that is running", async () => {
    loadGameIcon.mockClear();
    const running = createLaunchSpec(loadGameIcon, (appId) => appId === "250820");
    const { key, deps } = setup();

    await refreshIcon(running, { appid: "250820" }, key, deps);
    expect(loadGameIcon).toHaveBeenLastCalledWith("250820", "auto", { running: true, scale: 100 });

    await refreshIcon(running, { appid: "1" }, key, deps);
    expect(loadGameIcon).toHaveBeenLastCalledWith("1", "auto", { running: false, scale: 100 });
  });

  it.each(["auto", "cover", "header", "logo"])("passes art %s through", async (art) => {
    loadGameIcon.mockClear();
    const { key, deps } = setup();
    await refreshIcon(launchSpec, { appid: "1", art }, key, deps);
    expect(loadGameIcon).toHaveBeenCalledWith("1", art, { running: false, scale: 100 });
  });

  it("shows the generic icon and does not alert when no game is chosen", async () => {
    const { key, deps } = setup();
    await refreshIcon(launchSpec, {}, key, deps);

    expect(deps.loadIcon).toHaveBeenCalledWith("actions/launch/generic.svg");
    expect(key.setImage).toHaveBeenCalledTimes(1);
    expect(key.showAlert).not.toHaveBeenCalled();
  });

  it("alerts, logs as info, and opens nothing when pressed with no game chosen", async () => {
    const { key, deps } = setup();
    await activate(launchSpec, {}, key, deps);

    expect(key.showAlert).toHaveBeenCalledTimes(1);
    expect(deps.open).not.toHaveBeenCalled();
    expect(deps.logger.info).toHaveBeenCalled();
    expect(deps.logger.error).not.toHaveBeenCalled();
  });

  it("opens steam://rungameid/<appid> on press", async () => {
    const { key, deps } = setup();
    await activate(launchSpec, { appid: "250820", art: "cover" }, key, deps);
    expect(deps.open).toHaveBeenCalledExactlyOnceWith("steam://rungameid/250820");
  });

  it.each([
    [{ appid: "12a" }],
    [{ appid: "" }],
    [{ appid: "../x" }],
    [{ appid: "12345678901" }],
    [{ appid: 5 as unknown as string }],
    [{ appid: null as unknown as string }],
    [{ appid: "1", art: "poster" }],
    [{ art: "poster" }],
  ])("rejects %j: alert, nothing launched, no icon", async (settings) => {
    const refresh = setup();
    await refreshIcon(launchSpec, settings, refresh.key, refresh.deps);
    expect(refresh.key.showAlert).toHaveBeenCalledTimes(1);
    expect(refresh.key.setImage).not.toHaveBeenCalled();
    expect(refresh.deps.logger.error).toHaveBeenCalled();

    const press = setup();
    await activate(launchSpec, settings, press.key, press.deps);
    expect(press.key.showAlert).toHaveBeenCalledTimes(1);
    expect(press.deps.open).not.toHaveBeenCalled();
  });

  it("alerts and logs, without throwing, when the art loader fails", async () => {
    const failing = createLaunchSpec(vi.fn().mockRejectedValue(new Error("boom")));
    const { key, deps } = setup();
    await expect(refreshIcon(failing, { appid: "1" }, key, deps)).resolves.toBeUndefined();
    expect(key.showAlert).toHaveBeenCalledTimes(1);
    expect(deps.logger.error).toHaveBeenCalled();
  });

  it("alerts and logs, without throwing, when xdg-open fails", async () => {
    const { key, deps } = setup({ open: vi.fn().mockRejectedValue(new Error("ENOENT")) });
    await expect(activate(launchSpec, { appid: "1" }, key, deps)).resolves.toBeUndefined();
    expect(key.showAlert).toHaveBeenCalledTimes(1);
    expect(deps.logger.error).toHaveBeenCalled();
  });
});

describe("setImage regression guard across the key actions", () => {
  it("only ever passes data URIs, including unset and fallback paths", async () => {
    const launch = createLaunchSpec(async () => "data:image/svg+xml;base64,AAAA");
    const { key, deps } = setup();

    for (const status of STATUSES) await refreshIcon(statusSpec, { status }, key, deps);
    for (const openview of VIEWS) await refreshIcon(viewSpec, { openview }, key, deps);
    await refreshIcon(launch, {}, key, deps);
    await refreshIcon(launch, { appid: "250820", art: "logo" }, key, deps);

    expect(key.setImage.mock.calls.length).toBe(STATUSES.length + VIEWS.length + 2);
    for (const [image] of key.setImage.mock.calls) expect(image).toMatch(/^data:/);
  });
});

describe("friend spec", () => {
  const ID = "76561198000000010";
  const render = vi.fn(async (steamId: string) => `data:image/svg+xml;base64,${Buffer.from(steamId).toString("base64")}`);
  const friendSpec = createFriendSpec(render);

  it.each(["on", "off"])("accepts flash %s", async (flash) => {
    const { key, deps } = setup();
    await refreshIcon(friendSpec, { steamid: ID, flash }, key, deps);
    expect(key.setImage).toHaveBeenCalledTimes(1);
    expect(key.showAlert).not.toHaveBeenCalled();
  });

  it.each(["ON", "yes", "", "true", 1 as unknown as string, null as unknown as string])(
    "rejects flash %j: alert, no icon, nothing opened",
    async (flash) => {
      const refresh = setup();
      await refreshIcon(friendSpec, { steamid: ID, flash }, refresh.key, refresh.deps);
      expect(refresh.key.showAlert).toHaveBeenCalledTimes(1);
      expect(refresh.key.setImage).not.toHaveBeenCalled();

      const press = setup();
      await activate(friendSpec, { steamid: ID, flash }, press.key, press.deps);
      expect(press.key.showAlert).toHaveBeenCalledTimes(1);
      expect(press.deps.open).not.toHaveBeenCalled();
    },
  );

  it("renders the chosen friend", async () => {
    render.mockClear();
    const { key, deps } = setup();
    await refreshIcon(friendSpec, { steamid: ID }, key, deps);

    expect(render).toHaveBeenCalledExactlyOnceWith(ID);
    expect(key.setImage).toHaveBeenCalledTimes(1);
    expect(key.setImage.mock.calls[0]?.[0]).toMatch(/^data:/);
    expect(key.showAlert).not.toHaveBeenCalled();
  });

  it("shows the placeholder and does not alert when no friend is chosen", async () => {
    const { key, deps } = setup();
    await refreshIcon(friendSpec, {}, key, deps);
    expect(deps.loadIcon).toHaveBeenCalledWith("actions/friend/placeholder.svg");
    expect(key.setImage).toHaveBeenCalledTimes(1);
    expect(key.showAlert).not.toHaveBeenCalled();
  });

  it("alerts, logs as info, and opens nothing when pressed with no friend chosen", async () => {
    const { key, deps } = setup();
    await activate(friendSpec, {}, key, deps);
    expect(key.showAlert).toHaveBeenCalledTimes(1);
    expect(deps.open).not.toHaveBeenCalled();
    expect(deps.logger.info).toHaveBeenCalled();
    expect(deps.logger.error).not.toHaveBeenCalled();
  });

  it("opens a chat with the friend on press", async () => {
    const { key, deps } = setup();
    await activate(friendSpec, { steamid: ID }, key, deps);
    expect(deps.open).toHaveBeenCalledExactlyOnceWith(`steam://friends/message/${ID}`);
  });

  it.each([
    [{ steamid: "" }],
    [{ steamid: "123" }],
    [{ steamid: "../x" }],
    [{ steamid: `${ID}; rm -rf ~` }],
    [{ steamid: `${ID}\n` }],
    [{ steamid: 76561198000000010 as unknown as string }],
    [{ steamid: null as unknown as string }],
  ])("rejects %j: alert, nothing opened, no icon", async (settings) => {
    const refresh = setup();
    await refreshIcon(friendSpec, settings, refresh.key, refresh.deps);
    expect(refresh.key.showAlert).toHaveBeenCalledTimes(1);
    expect(refresh.key.setImage).not.toHaveBeenCalled();
    expect(refresh.deps.logger.error).toHaveBeenCalled();

    const press = setup();
    await activate(friendSpec, settings, press.key, press.deps);
    expect(press.key.showAlert).toHaveBeenCalledTimes(1);
    expect(press.deps.open).not.toHaveBeenCalled();
  });

  it("alerts and logs, without throwing, when rendering or opening fails", async () => {
    const failing = createFriendSpec(vi.fn().mockRejectedValue(new Error("boom")));
    const a = setup();
    await expect(refreshIcon(failing, { steamid: ID }, a.key, a.deps)).resolves.toBeUndefined();
    expect(a.key.showAlert).toHaveBeenCalledTimes(1);

    const b = setup({ open: vi.fn().mockRejectedValue(new Error("ENOENT")) });
    await expect(activate(friendSpec, { steamid: ID }, b.key, b.deps)).resolves.toBeUndefined();
    expect(b.key.showAlert).toHaveBeenCalledTimes(1);
  });

  it("only ever passes data URIs to setImage", async () => {
    const { key, deps } = setup();
    await refreshIcon(friendSpec, {}, key, deps);
    await refreshIcon(friendSpec, { steamid: ID }, key, deps);
    for (const [image] of key.setImage.mock.calls) expect(image).toMatch(/^data:/);
  });
});
