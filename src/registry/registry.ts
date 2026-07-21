import { buildTreeFromCorpus } from '../build/inmemory.js';
import { verifyTree } from '../core/gate.js';
import { treeSchema } from '../core/store.js';
import type { Tree, TreeVerification } from '../core/types.js';
import type { GithubSnapshot } from './github.js';

export interface InstantTreeResult {
  tree: Tree;
  verification: TreeVerification;
  sha: string;
}

/** Deterministic, LLM-free tree for any public repo snapshot — the paste-a-URL path. */
export const instantTree = async (snapshot: GithubSnapshot, name: string): Promise<InstantTreeResult> => {
  const { tree, verification } = await buildTreeFromCorpus(snapshot.corpus, {
    name,
    provider: null,
    generator: '@northtek/overstory registry (extractive)',
  });
  return { tree, verification, sha: snapshot.sha };
};

export interface PublishVerdict {
  accepted: boolean;
  freshness: number;
  claims: number;
  verified: number;
  /** Present when rejected: the receipts that failed, capped for response size. */
  failures: Array<{ claimId: string; text: string; verdict: string }>;
}

/** The registry's core adjudication: an uploaded tree is accepted ONLY if every receipt
 * verifies against the snapshot the server fetched itself from GitHub. Nothing partial is
 * hosted — a 99% tree is a rejection with the failing 1% listed. The uploader is never
 * trusted; the code is. */
export const adjudicatePublish = (
  rawTree: unknown,
  snapshot: GithubSnapshot,
): { verdict: PublishVerdict; tree: Tree | null } => {
  let tree: Tree;
  try {
    tree = treeSchema.parse(rawTree) as Tree;
  } catch {
    return {
      tree: null,
      verdict: { accepted: false, freshness: 0, claims: 0, verified: 0, failures: [{ claimId: '-', text: 'tree failed schema validation', verdict: 'INVALID' }] },
    };
  }
  const verification = verifyTree(tree, snapshot.corpus);
  const failures: PublishVerdict['failures'] = [];
  if (verification.freshness < 1) {
    for (const node of Object.values(tree.nodes)) {
      for (const claim of node.claims) {
        const verdict = verification.verdicts.get(claim.id);
        if (verdict && verdict !== 'VERIFIED' && failures.length < 20) {
          failures.push({ claimId: claim.id, text: claim.text.slice(0, 160), verdict });
        }
      }
    }
  }
  const verified = [...verification.verdicts.values()].filter((v) => v === 'VERIFIED').length;
  return {
    tree: verification.freshness === 1 ? tree : null,
    verdict: {
      accepted: verification.freshness === 1,
      freshness: verification.freshness,
      claims: verification.verdicts.size,
      verified,
      failures,
    },
  };
};

/** Re-verification of a stored tree against a fresh snapshot (freshness decay over time). */
export const reverify = (tree: Tree, snapshot: GithubSnapshot): { freshness: number; verified: number; claims: number } => {
  const verification = verifyTree(tree, snapshot.corpus);
  const verified = [...verification.verdicts.values()].filter((v) => v === 'VERIFIED').length;
  return { freshness: verification.freshness, verified, claims: verification.verdicts.size };
};
