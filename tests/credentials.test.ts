import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import {
  clearCredential,
  credentialsPath,
  maskKey,
  readCredentials,
  resolveKey,
  saveCredential,
} from '../src/core/credentials.js';
import { localRequestError } from '../src/serve/server.js';
import { looksLikeKey, PROVIDER_CATALOG, findProvider } from '../src/llm/catalog.js';

let dir: string;
const CANARY = ['sk', 'ant', 'api03', 'CANARY0123456789ABCDEF'].join('-');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'overstory-creds-'));
  process.env.OVERSTORY_CREDENTIALS = join(dir, 'credentials.json');
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  delete process.env.OVERSTORY_CREDENTIALS;
  rmSync(dir, { recursive: true, force: true });
});

describe('credential storage', () => {
  it('never stores keys inside the project, where tree.json is committed', () => {
    delete process.env.OVERSTORY_CREDENTIALS;
    const path = credentialsPath();
    // The danger being guarded against: a credentials file sitting next to the tree.json
    // that CONTRIBUTING.md tells people to commit. Keys belong to the person, not the repo.
    expect(path.startsWith(process.cwd())).toBe(false);
    expect(path.startsWith(homedir())).toBe(true);
    expect(path.endsWith(join('.overstory', 'credentials.json'))).toBe(true);
  });

  it('round-trips a key, model, and base URL', () => {
    saveCredential('anthropic', { key: CANARY, model: 'claude-sonnet-5' });
    saveCredential('openai-compatible', { baseUrl: 'https://openrouter.ai/api/v1' });
    const creds = readCredentials();
    expect(creds.keys.anthropic).toBe(CANARY);
    expect(creds.models?.anthropic).toBe('claude-sonnet-5');
    expect(creds.baseUrls?.['openai-compatible']).toBe('https://openrouter.ai/api/v1');
  });

  it('writes owner-only permissions', () => {
    saveCredential('anthropic', { key: CANARY });
    if (platform() === 'win32') return; // POSIX modes are not meaningful here
    expect(statSync(credentialsPath()).mode & 0o077).toBe(0);
  });

  it('treats a corrupt file as empty rather than crashing', () => {
    saveCredential('anthropic', { key: CANARY });
    require('node:fs').writeFileSync(credentialsPath(), '{ not json');
    expect(readCredentials().keys).toEqual({});
  });

  it('lets the environment win over the stored file', () => {
    saveCredential('anthropic', { key: CANARY });
    expect(resolveKey('anthropic', 'ANTHROPIC_API_KEY')).toBe(CANARY);
    process.env.ANTHROPIC_API_KEY = 'from-environment';
    expect(resolveKey('anthropic', 'ANTHROPIC_API_KEY')).toBe('from-environment');
  });

  it('clears a key completely', () => {
    saveCredential('anthropic', { key: CANARY, model: 'claude-sonnet-5' });
    clearCredential('anthropic');
    const creds = readCredentials();
    expect(creds.keys.anthropic).toBeUndefined();
    expect(creds.models?.anthropic).toBeUndefined();
    expect(readFileSync(credentialsPath(), 'utf8')).not.toContain('CANARY');
  });

  it('masks a key to something recognisable but unusable', () => {
    const masked = maskKey(CANARY);
    expect(masked).not.toContain('CANARY');
    expect(masked.length).toBeLessThan(CANARY.length);
    expect(maskKey('short')).toBe('••••');
  });
});

describe('key pre-flight', () => {
  it('catches the ways a paste actually goes wrong', () => {
    expect(looksLikeKey('anthropic', '').ok).toBe(false);
    expect(looksLikeKey('anthropic', 'sk-ant-too short here').ok).toBe(false);
    expect(looksLikeKey('anthropic', 'abcdefghijklmnopqrst').ok).toBe(false); // wrong prefix
    expect(looksLikeKey('anthropic', CANARY).ok).toBe(true);
  });

  it('accepts anything plausible for providers without a fixed prefix', () => {
    expect(looksLikeKey('openai-compatible', 'or-v1-0123456789abcdef').ok).toBe(true);
  });
});

describe('provider catalog', () => {
  it('states for every provider whether code leaves the machine', () => {
    for (const p of PROVIDER_CATALOG) {
      expect(typeof p.sendsCodeOffMachine).toBe('boolean');
      expect(p.summary.length).toBeGreaterThan(20);
    }
    expect(findProvider('none')?.sendsCodeOffMachine).toBe(false);
    expect(findProvider('ollama')?.sendsCodeOffMachine).toBe(false);
    expect(findProvider('anthropic')?.sendsCodeOffMachine).toBe(true);
  });

  it('gives every key-taking provider somewhere to get one', () => {
    for (const p of PROVIDER_CATALOG.filter((x) => x.needsKey)) {
      expect(p.keyUrl).toMatch(/^https:\/\//u);
      expect(p.envVar).toBeTruthy();
    }
  });
});

describe('local-only request guard', () => {
  const headers = (h: Record<string, string>) => ({ headers: h }) as never;

  it('allows loopback hosts', () => {
    for (const host of ['127.0.0.1:7433', 'localhost:7433', 'localhost', '[::1]:7433']) {
      expect(localRequestError(headers({ host }))).toBeNull();
    }
  });

  it('refuses a rebound hostname, which is how a web page reaches localhost', () => {
    expect(localRequestError(headers({ host: 'evil.example.com' }))).toMatch(/refused/u);
    expect(localRequestError(headers({ host: 'attacker.test:7433' }))).toMatch(/refused/u);
    expect(localRequestError(headers({}))).toMatch(/refused/u);
  });

  it('refuses a cross-origin request even when the Host looks right', () => {
    expect(localRequestError(headers({ host: '127.0.0.1:7433', origin: 'https://evil.example.com' }))).toMatch(/cross-origin/u);
    expect(localRequestError(headers({ host: '127.0.0.1:7433', origin: 'nonsense' }))).toMatch(/malformed/u);
    expect(localRequestError(headers({ host: '127.0.0.1:7433', origin: 'http://localhost:7433' }))).toBeNull();
  });
});
