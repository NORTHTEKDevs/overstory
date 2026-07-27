import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Where API keys live.
 *
 * Deliberately the user's home directory and never the project: a project's `.overstory/`
 * holds `tree.json`, which this project's own docs tell people to commit. A credentials file
 * one directory away from a file you are told to commit is an accident waiting to happen.
 * Keys are also per-person, not per-repo, so home is where they belong anyway.
 */
export const credentialsPath = (): string =>
  process.env.OVERSTORY_CREDENTIALS ?? join(homedir(), '.overstory', 'credentials.json');

export interface StoredCredentials {
  /** provider id -> API key */
  keys: Record<string, string>;
  /** provider id -> last chosen model */
  models?: Record<string, string>;
  /** provider id -> base URL, for OpenAI-compatible endpoints */
  baseUrls?: Record<string, string>;
}

const empty = (): StoredCredentials => ({ keys: {}, models: {}, baseUrls: {} });

/** Read stored credentials. A missing or corrupt file is treated as "nothing stored" —
 * never a crash, because a bad credentials file must not stop the tool working offline. */
export const readCredentials = (): StoredCredentials => {
  try {
    const raw = readFileSync(credentialsPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return empty();
    const obj = parsed as Partial<StoredCredentials>;
    return {
      keys: obj.keys && typeof obj.keys === 'object' ? obj.keys : {},
      models: obj.models && typeof obj.models === 'object' ? obj.models : {},
      baseUrls: obj.baseUrls && typeof obj.baseUrls === 'object' ? obj.baseUrls : {},
    };
  } catch {
    return empty();
  }
};

/** Write credentials with owner-only permissions. */
const write = (creds: StoredCredentials): void => {
  const path = credentialsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(creds, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  try {
    // Existing files keep their old mode through writeFileSync, so set it explicitly.
    chmodSync(path, 0o600);
  } catch {
    // Windows and some filesystems do not implement POSIX modes; the write still succeeded.
  }
};

export const saveCredential = (
  provider: string,
  values: { key?: string; model?: string; baseUrl?: string },
): void => {
  const creds = readCredentials();
  if (values.key !== undefined) creds.keys[provider] = values.key;
  if (values.model !== undefined) (creds.models ??= {})[provider] = values.model;
  if (values.baseUrl !== undefined) (creds.baseUrls ??= {})[provider] = values.baseUrl;
  write(creds);
};

export const clearCredential = (provider: string): void => {
  const creds = readCredentials();
  delete creds.keys[provider];
  delete creds.models?.[provider];
  delete creds.baseUrls?.[provider];
  write(creds);
};

/** Environment wins over the stored file, so CI and shell exports keep behaving as before
 * and a stored key never silently overrides one an operator set deliberately. */
export const resolveKey = (provider: string, envVar: string): string | undefined =>
  process.env[envVar] ?? readCredentials().keys[provider];

/** A key rendered for display: enough to recognise, not enough to use. Never send a raw key
 * back to a client — the UI only ever needs to answer "is one set, and which". */
export const maskKey = (key: string): string => {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
};

export const hasStoredCredentials = (): boolean => existsSync(credentialsPath());
