import { treeSchema } from '../core/store.js';
import type { Tree } from '../core/types.js';

/** Where a repo's own published tree may live — the OWNER's repo is the database; the
 * registry stores nothing. Checked in order. */
const candidates = (owner: string, repo: string, ref: string): string[] => [
  `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/.overstory/tree.json`,
  `https://github.com/${owner}/${repo}/releases/latest/download/overstory-tree.json`,
];

export interface RepoTreeResult {
  tree: Tree;
  source: string;
}

/** Fetch the tree the repo owner committed to their own repository. Null when they haven't
 * published one (the instant extractive tree is the fallback). Schema-invalid trees are
 * treated as absent — never rendered. */
export const fetchRepoTree = async (
  owner: string,
  repo: string,
  ref = 'HEAD',
  fetchImpl: typeof fetch = fetch,
  maxBytes = 30_000_000,
): Promise<RepoTreeResult | null> => {
  for (const url of candidates(owner, repo, ref)) {
    try {
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(30_000),
        headers: { 'user-agent': 'overstory-registry' },
        redirect: 'follow',
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.length > maxBytes) continue;
      const tree = treeSchema.parse(JSON.parse(text)) as Tree;
      return { tree, source: url.includes('raw.githubusercontent') ? '.overstory/tree.json' : 'release asset' };
    } catch {
      continue;
    }
  }
  return null;
};
