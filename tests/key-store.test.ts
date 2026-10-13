import { describe, expect, it, vi } from "vitest";
import { createKeyStore, isApiKey, type GlobalSettingsStore } from "../src/key-store.js";

const KEY = "0123456789abcdef0123456789abcdef";

function storeWith(initial: { apiKey?: unknown } = {}) {
  const stored: { apiKey?: unknown } = { ...initial };
  const store: GlobalSettingsStore = {
    getGlobalSettings: vi.fn(async () => ({ ...stored })),
    setGlobalSettings: vi.fn(async (value) => {
      delete stored.apiKey;
      Object.assign(stored, value);
    }),
  };
  return { store, stored };
}

describe("isApiKey", () => {
  it.each([KEY, KEY.toUpperCase(), "ABCDEFabcdef0123456789ABCDEFabcd"])("accepts %s", (value) => {
    expect(isApiKey(value)).toBe(true);
  });

  it.each(["", KEY.slice(1), `${KEY}0`, `${KEY.slice(1)}g`, ` ${KEY.slice(1)}`, `${KEY}\n`, 5, null, undefined, {}])(
    "rejects %j",
    (value) => {
      expect(isApiKey(value)).toBe(false);
    },
  );
});

describe("createKeyStore", () => {
  it("loads a stored key and reports it", async () => {
    const { store } = storeWith({ apiKey: KEY });
    const onChange = vi.fn();
    const keys = createKeyStore(store, onChange);
    await keys.load();
    expect(keys.get()).toBe(KEY);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(KEY);
  });

  it("ignores a stored value that is not a valid key", async () => {
    const { store } = storeWith({ apiKey: "garbage" });
    const onChange = vi.fn();
    const keys = createKeyStore(store, onChange);
    await keys.load();
    expect(keys.get()).toBeUndefined();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("stores a valid key and reports it", async () => {
    const { store, stored } = storeWith();
    const onChange = vi.fn();
    const keys = createKeyStore(store, onChange);
    await keys.set(KEY);
    expect(stored.apiKey).toBe(KEY);
    expect(keys.get()).toBe(KEY);
    expect(onChange).toHaveBeenLastCalledWith(KEY);
  });

  it("refuses to store a malformed key", async () => {
    const { store } = storeWith();
    const keys = createKeyStore(store, vi.fn());
    await expect(keys.set("short")).rejects.toThrow();
    expect(store.setGlobalSettings).not.toHaveBeenCalled();
    expect(keys.get()).toBeUndefined();
  });

  it("clears the key", async () => {
    const { store, stored } = storeWith({ apiKey: KEY });
    const onChange = vi.fn();
    const keys = createKeyStore(store, onChange);
    await keys.load();
    await keys.clear();
    expect(stored.apiKey).toBeUndefined();
    expect(keys.get()).toBeUndefined();
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
