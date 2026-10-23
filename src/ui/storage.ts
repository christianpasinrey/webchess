/**
 * Settings storage. The API key lives in sessionStorage (cleared when the tab closes)
 * unless the player opts in to remembering it in this browser (localStorage).
 * Every access is guarded: storage can be unavailable in private modes.
 */
const PREFIX = "webchess.";
const KEYS = { apiKey: `${PREFIX}apiKey`, workspaceId: `${PREFIX}workspaceId`, remember: `${PREFIX}remember` } as const;

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value) storage().setItem(key, value);
    else storage().removeItem(key);
  } catch {
    // Storage blocked: keep working with in-memory values only.
  }
}

const local = () => window.localStorage;
const session = () => window.sessionStorage;

export interface StoredCredentials {
  apiKey: string;
  workspaceId: string;
  remember: boolean;
}

export function loadCredentials(): StoredCredentials {
  const remember = read(local, KEYS.remember) === "1";
  const pick = (key: string) => read(session, key) ?? (remember ? read(local, key) : null) ?? "";
  return { apiKey: pick(KEYS.apiKey), workspaceId: pick(KEYS.workspaceId), remember };
}

/** Non-secret settings (opponent, BOT level): always remembered in this browser. */
export function loadPreference(name: string): string | null {
  return read(local, `${PREFIX}${name}`);
}

export function savePreference(name: string, value: string) {
  write(local, `${PREFIX}${name}`, value);
}

export function saveCredentials({ apiKey, workspaceId, remember }: StoredCredentials) {
  write(session, KEYS.apiKey, apiKey);
  write(session, KEYS.workspaceId, workspaceId);
  write(local, KEYS.remember, remember ? "1" : null);
  write(local, KEYS.apiKey, remember ? apiKey : null);
  write(local, KEYS.workspaceId, remember ? workspaceId : null);
}
