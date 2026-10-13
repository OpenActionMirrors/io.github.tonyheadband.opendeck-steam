import { execFile } from "node:child_process";

export type Opener = (uri: string) => Promise<void>;

// A blocked xdg-open must still settle, or the key never shows success or an alert.
export const createXdgOpen =
  (timeoutMs: number): Opener =>
  (uri) =>
    new Promise((resolve, reject) => {
      execFile("xdg-open", [uri], { timeout: timeoutMs }, (error) => (error ? reject(error) : resolve()));
    });

export const xdgOpen: Opener = createXdgOpen(10_000);
