import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Tree } from '../core/types.js';
import type { PublishVerdict } from './registry.js';

const execFileP = promisify(execFile);

export const DEFAULT_REGISTRY = 'https://overstory.northtek.io';

/** Parse owner/repo out of any common GitHub remote form. */
export const parseGithubRemote = (url: string): { owner: string; repo: string } | null => {
  const match = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/u.exec(url.trim());
  return match ? { owner: match[1], repo: match[2] } : null;
};

export const detectGithubRepo = async (root: string): Promise<{ owner: string; repo: string } | null> => {
  try {
    const { stdout } = await execFileP('git', ['remote', 'get-url', 'origin'], { cwd: root, timeout: 5_000 });
    return parseGithubRemote(stdout);
  } catch {
    return null;
  }
};

export interface PublishResponse {
  verdict: PublishVerdict;
  url?: string;
  badge?: string;
}

/** Upload a locally-built tree; the registry re-verifies every receipt against GitHub
 * before accepting. A rejection is a feature, not an error — it lists the receipts that
 * failed so `overstory build` can be re-run. */
export const publishTree = async (
  registry: string,
  owner: string,
  repo: string,
  ref: string,
  tree: Tree,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResponse> => {
  const res = await fetchImpl(`${registry.replace(/\/$/u, '')}/api/publish`, {
    method: 'POST',
    signal: AbortSignal.timeout(120_000),
    headers: { 'content-type': 'application/json', 'user-agent': 'overstory-cli' },
    body: JSON.stringify({ owner, repo, ref, tree }),
  });
  const body = (await res.json()) as PublishResponse & { error?: string };
  if (!res.ok && !body.verdict) throw new Error(body.error ?? `registry returned HTTP ${res.status}`);
  return body;
};
