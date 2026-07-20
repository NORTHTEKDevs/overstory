import { Bm25Index } from '../core/bm25.js';
import type { Claim, CorpusSnapshot, Tree, TreeVerification } from '../core/types.js';

export interface NotarizeInput {
  text: string;
  citations: Array<{ file: string; startLine: number; endLine: number }>;
}

export interface NotarizedClaim {
  text: string;
  verdict: 'RESOLVED' | 'OUT_OF_CORPUS' | 'UNGROUNDED';
  receipts: Array<{ file: string; lines: string; text: string } | { missing: string }>;
  corroboration: { claimId: string; text: string; score: number } | null;
}

/** Mechanical notarization of externally-drafted claims (host agents, serve API):
 * citations must resolve in the live corpus; receipt text is returned so the caller can
 * self-check support; VERIFIED tree claims corroborate when they match. Deliberately never
 * a claim of semantic truth — verdict names say RESOLVED, not TRUE. */
export const notarizeClaims = (
  claims: NotarizeInput[],
  tree: Tree,
  corpus: CorpusSnapshot,
  verification: TreeVerification,
  index: Bm25Index,
  byId: Map<string, { claim: Claim; nodeId: string }>,
): { results: NotarizedClaim[]; summary: { resolved: number; of: number } } => {
  const results = claims.map((claim): NotarizedClaim => {
    if (claim.citations.length === 0) return { text: claim.text, verdict: 'UNGROUNDED', receipts: [], corroboration: null };
    const receipts: NotarizedClaim['receipts'] = [];
    let bad = false;
    for (const c of claim.citations) {
      const file = corpus.files.get(c.file.replace(/\\/gu, '/'));
      if (!file || c.startLine > file.lines.length || c.endLine < c.startLine) {
        receipts.push({ missing: `${c.file}:${c.startLine}-${c.endLine}` });
        bad = true;
        continue;
      }
      receipts.push({
        file: c.file,
        lines: `${c.startLine}-${Math.min(c.endLine, file.lines.length)}`,
        text: file.lines.slice(c.startLine - 1, Math.min(c.endLine, file.lines.length)).join('\n').slice(0, 800),
      });
    }
    const top = index.search(claim.text, 1)[0];
    const corroboration =
      top && verification.verdicts.get(top.id) === 'VERIFIED'
        ? { claimId: top.id, text: byId.get(top.id)!.claim.text, score: Number(top.score.toFixed(3)) }
        : null;
    return { text: claim.text, verdict: bad ? 'OUT_OF_CORPUS' : 'RESOLVED', receipts, corroboration };
  });
  return { results, summary: { resolved: results.filter((r) => r.verdict === 'RESOLVED').length, of: results.length } };
};
