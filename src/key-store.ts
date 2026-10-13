export const isApiKey = (value: unknown): value is string => typeof value === "string" && /^[0-9A-Fa-f]{32}$/.test(value);

export interface GlobalSettingsStore {
  getGlobalSettings(): Promise<{ apiKey?: unknown }>;
  setGlobalSettings(value: { apiKey?: string }): Promise<void>;
}

export interface KeyStore {
  load(): Promise<void>;
  get(): string | undefined;
  set(key: string): Promise<void>;
  clear(): Promise<void>;
}

export function createKeyStore(store: GlobalSettingsStore, onChange: (key: string | undefined) => void): KeyStore {
  let current: string | undefined;

  const change = (next: string | undefined) => {
    current = next;
    onChange(next);
  };

  return {
    async load() {
      const { apiKey } = await store.getGlobalSettings();
      change(isApiKey(apiKey) ? apiKey : undefined);
    },
    get: () => current,
    async set(key) {
      if (!isApiKey(key)) throw new Error("Invalid Steam Web API key");
      await store.setGlobalSettings({ apiKey: key });
      change(key);
    },
    async clear() {
      await store.setGlobalSettings({});
      change(undefined);
    },
  };
}
