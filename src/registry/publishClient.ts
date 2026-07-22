import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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

export interface CheckResponse {
  published: boolean;
  source?: string;
  sha?: string;
  freshness?: number;
  verified?: number;
  claims?: number;
  url?: string;
  badge?: string;
  hint?: string;
}

/** Zero-storage publishing: the tree lives in YOUR repo (.overstory/tree.json or a release
 * asset). This asks the registry to fetch your tree from your repo and verify it against
 * your code — the registry stores nothing, ever. */
export const checkPublished = async (
  registry: string,
  owner: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckResponse> => {
  const res = await fetchImpl(`${registry.replace(/\/$/u, '')}/api/check`, {
    method: 'POST',
    signal: AbortSignal.timeout(120_000),
    headers: { 'content-type': 'application/json', 'user-agent': 'overstory-cli' },
    body: JSON.stringify({ owner, repo }),
  });
  let body: CheckResponse & { error?: string };
  try {
    body = (await res.json()) as CheckResponse & { error?: string };
  } catch {
    throw new Error(`registry returned HTTP ${res.status} with a non-JSON body — check OVERSTORY_REGISTRY points at the registry root`);
  }
  if (!res.ok && res.status !== 404) throw new Error(body.error ?? `registry returned HTTP ${res.status}`);
  return body;
};
