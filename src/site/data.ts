import type { Tree, TreeVerification, Verdict } from '../core/types.js';

export interface SiteSpan {
  file: string;
  startLine: number;
  endLine: number;
  text: string;
  hash: string;
}

export interface SiteClaim {
  id: string;
  text: string;
  verdict: Verdict;
  faithfulness: 'supported' | 'unsupported' | 'unchecked';
  spans: SiteSpan[];
  refs: Array<{ nodeId: string; claimId: string }>;
}

export interface SiteNode {
  id: string;
  kind: 'leaf' | 'dir' | 'root';
  path: string;
  title: string;
  claims: SiteClaim[];
  childIds: string[];
  builtWith: string;
  provider?: string;
  /** Worst verdict anywhere in this subtree — drives the trust dot in the rail. */
  worst: Verdict;
  verified: number;
  total: number;
}

export interface SiteData {
  name: string;
  builtAt: string;
  generator: string;
  freshness: number;
  verified: number;
  total: number;
  root: string;
  nodes: Record<string, SiteNode>;
}

const SEVERITY: Record<Verdict, number> = { VERIFIED: 0, STALE: 1, OUT_OF_CORPUS: 2, UNGROUNDED: 3 };

/** Flatten the tree + verification into the self-contained model the explorer embeds. */
export const buildSiteData = (tree: Tree, verification: TreeVerification): SiteData => {
  const nodes: Record<string, SiteNode> = {};
  let verifiedTotal = 0;
  let claimTotal = 0;

  for (const node of Object.values(tree.nodes)) {
    const counts = verification.byNode.get(node.id) ?? { verified: 0, total: 0 };
    verifiedTotal += counts.verified;
    claimTotal += counts.total;
    nodes[node.id] = {
      id: node.id,
      kind: node.kind,
      path: node.path,
      title: node.title,
      childIds: node.childIds,
      builtWith: node.builtWith,
      provider: node.provider,
      worst: 'VERIFIED',
      verified: counts.verified,
      total: counts.total,
      claims: node.claims.map((c) => ({
        id: c.id,
        text: c.text,
        verdict: c.verdict ?? verification.verdicts.get(c.id) ?? 'UNGROUNDED',
        faithfulness: c.faithfulness ?? 'unchecked',
        spans: c.citations
          .filter((x): x is Extract<typeof x, { kind: 'span' }> => x.kind === 'span')
          .map((x) => ({
            file: x.span.file,
            startLine: x.span.startLine,
            endLine: x.span.endLine,
            text: x.span.text,
            hash: x.span.contentHash,
          })),
        refs: c.citations
          .filter((x): x is Extract<typeof x, { kind: 'claim' }> => x.kind === 'claim')
          .map((x) => x.ref),
      })),
    };
  }

  const worstOf = (id: string, seen = new Set<string>()): Verdict => {
    // Revisits report the already-computed worst (diamond shapes), never a blind VERIFIED.
    if (seen.has(id)) return nodes[id]?.worst ?? 'VERIFIED';
    seen.add(id);
    const node = nodes[id];
    if (!node) return 'VERIFIED';
    let worst: Verdict = 'VERIFIED';
    for (const claim of node.claims) if (SEVERITY[claim.verdict] > SEVERITY[worst]) worst = claim.verdict;
    for (const child of node.childIds) {
      const w = worstOf(child, seen);
      if (SEVERITY[w] > SEVERITY[worst]) worst = w;
    }
    node.worst = worst;
    return worst;
  };
  worstOf(tree.root);

  return {
    name: tree.name,
    builtAt: tree.builtAt,
    generator: tree.generator,
    freshness: claimTotal === 0 ? 1 : verifiedTotal / claimTotal,
    verified: verifiedTotal,
    total: claimTotal,
    root: tree.root,
    nodes,
  };
};
