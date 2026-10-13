import { execFile } from "node:child_process";

export interface SteamWindow {
  id: string;
  className: string;
  title: string;
}

export interface WindowControl {
  list(): Promise<SteamWindow[]>;
  close(id: string): Promise<void>;
}

export const STEAM_WINDOW_CLASS = "steamwebhelper.steam";
export const FRIENDS_WINDOW_TITLE = "Friends List";
export const MAIN_WINDOW_TITLE = "Steam";

// `wmctrl -lx` lines: <id> <desktop> <class> <host> <title>
const LINE = /^(0x[0-9a-f]+)\s+(-?\d+)\s+(\S+)\s+(\S+)\s*(.*)$/;

export function parseWmctrl(output: string): SteamWindow[] {
  return output.split("\n").flatMap((line) => {
    const match = LINE.exec(line);
    return match ? [{ id: match[1]!, className: match[3]!, title: match[5] ?? "" }] : [];
  });
}

const run = (args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile("wmctrl", args, { timeout: 2_000 }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });

export function createWmctrl(): WindowControl {
  return {
    async list() {
      return parseWmctrl(await run(["-lx"]));
    },
    async close(id) {
      if (!/^0x[0-9a-f]+$/.test(id)) throw new Error("Invalid window id");
      await run(["-i", "-c", id]);
    },
  };
}

export async function findSteamWindow(control: WindowControl, title: string): Promise<SteamWindow | undefined> {
  return (await control.list()).find((window) => window.className === STEAM_WINDOW_CLASS && window.title === title);
}

export const findFriendsWindow = (control: WindowControl) => findSteamWindow(control, FRIENDS_WINDOW_TITLE);
