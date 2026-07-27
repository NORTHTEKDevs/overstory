import { sha256 } from './hash.js';
import type {
  Claim,
  ClaimVerification,
  CorpusSnapshot,
  SpanRef,
  SpanVerification,
  Tree,
  TreeVerification,
  Verdict,
} from './types.js';

/** Builder-side helper: cite lines start..end (1-based, inclusive) of a file as it
 * currently exists in the corpus. Throws if the file is absent — you cannot honestly
 * cite what you cannot see. */
export const makeSpan = (
  file: string,
  startLine: number,
  endLine: number,
  corpus: CorpusSnapshot,
): SpanRef => {
  const entry = corpus.files.get(file);
  if (!entry) throw new Error(`makeSpan: ${file} is not in the corpus`);
  const last = Math.min(endLine, entry.lines.length);
  const first = Math.max(1, Math.min(startLine, last));
  const text = entry.lines.slice(first - 1, last).join('\n');
  return { file, startLine: first, endLine: last, text, contentHash: sha256(text) };
};

/** Locate exact normalized text in a file at line granularity. Returns 1-based lines. */
const findText = (lines: string[], needle: string): { startLine: number; endLine: number } | null => {
  if (needle.length === 0) return null;
  const hay = lines.join('\n');
  let from = 0;
  for (;;) {
    const idx = hay.indexOf(needle, from);
    if (idx === -1) return null;
    const startsOnBoundary = idx === 0 || hay[idx - 1] === '\n';
    const end = idx + needle.length;
    const endsOnBoundary = end === hay.length || hay[end] === '\n';
    if (startsOnBoundary && endsOnBoundary) {
      const startLine = hay.slice(0, idx).split('\n').length;
      const endLine = startLine + needle.split('\n').length - 1;
      return { startLine, endLine };
    }
    from = idx + 1;
  }
};

/** Mechanical span verification against the live corpus. Assumes an internally
 * consistent receipt (text/hash agreement is enforced upstream in verifyClaim).
 * Self-heals when the cited text merely moved (edits above the span). */
export const verifySpan = (span: SpanRef, corpus: CorpusSnapshot): SpanVerification => {
  const file = corpus.files.get(span.file);
  if (!file) return { verdict: 'OUT_OF_CORPUS' };
  const atRecorded = file.lines.slice(span.startLine - 1, span.endLine).join('\n');
  if (sha256(atRecorded) === span.contentHash) return { verdict: 'VERIFIED' };
  // Healing anchors to the first byte-identical occurrence. When the text appears more
  // than once, any occurrence is equally valid EVIDENCE (the receipt is the text itself,
  // not its position), so first-match is deliberate, not an oversight.
  const moved = findText(file.lines, span.text);
  if (moved) return { verdict: 'VERIFIED', healed: moved };
  return { verdict: 'STALE' };
};

const SEVERITY: Record<Verdict, number> = {
  VERIFIED: 0,
  STALE: 1,
  OUT_OF_CORPUS: 2,
  UNGROUNDED: 3,
};

const worse = (a: Verdict, b: Verdict): Verdict => (SEVERITY[a] >= SEVERITY[b] ? a : b);

/** Fail-closed claim verification. A claim is VERIFIED only when every citation
 * verifies. Any internally inconsistent receipt (text/hash mismatch — a forgery or
 * corruption) voids the claim's grounding entirely: UNGROUNDED. Interior claims
 * (citing child claims) verify transitively; staleness propagates upward.
 *
 * `path` holds only the claims on the CURRENT recursion path (backtracked on return):
 * true cycles fail closed, while duplicate citations of the same evidence — a common
 * LLM habit — and diamond-shaped grounding verify correctly. Duplicate refs within one
 * claim are verified once (evidence is idempotent). */
export const verifyClaim = (
  claim: Claim,
  tree: Tree,
  corpus: CorpusSnapshot,
  path: Set<string> = new Set(),
): ClaimVerification => {
  const spans: SpanVerification[] = [];
  if (claim.citations.length === 0) return { claimId: claim.id, verdict: 'UNGROUNDED', spans };

  let verdict: Verdict = 'VERIFIED';
  const refsVerified = new Set<string>();
  for (const citation of claim.citations) {
    if (citation.kind === 'span') {
      const { span } = citation;
      if (span.text.length === 0 || sha256(span.text) !== span.contentHash) {
        return { claimId: claim.id, verdict: 'UNGROUNDED', spans };
      }
      const result = verifySpan(span, corpus);
      spans.push(result);
      verdict = worse(verdict, result.verdict);
    } else {
      const { nodeId, claimId } = citation.ref;
      const key = `${nodeId}:${claimId}`;
      if (refsVerified.has(key)) continue;
      refsVerified.add(key);
      const node = Object.hasOwn(tree.nodes, nodeId) ? tree.nodes[nodeId] : undefined;
      const child = node?.claims.find((c) => c.id === claimId);
      if (!child || path.has(key)) {
        verdict = worse(verdict, 'OUT_OF_CORPUS');
        continue;
      }
      path.add(key);
      const childResult = verifyClaim(child, tree, corpus, path);
      path.delete(key);
      verdict = worse(verdict, childResult.verdict);
    }
  }
  return { claimId: claim.id, verdict, spans };
};

/** Verify every claim in the tree. Freshness is the VERIFIED fraction (1.0 for an
 * empty tree — nothing claimed, nothing wrong). */
export const verifyTree = (tree: Tree, corpus: CorpusSnapshot): TreeVerification => {
  const verdicts = new Map<string, Verdict>();
  const details = new Map<string, ClaimVerification>();
  const byNode = new Map<string, { verified: number; total: number }>();
  let verified = 0;
  let total = 0;
  for (const node of Object.values(tree.nodes)) {
    const counts = { verified: 0, total: 0 };
    for (const claim of node.claims) {
      const result = verifyClaim(claim, tree, corpus);
      verdicts.set(claim.id, result.verdict);
      details.set(claim.id, result);
      counts.total += 1;
      total += 1;
      if (result.verdict === 'VERIFIED') {
        counts.verified += 1;
        verified += 1;
      }
    }
    byNode.set(node.id, counts);
  }
  return { verdicts, details, byNode, freshness: total === 0 ? 1 : verified / total };
};

/** Write verdicts + healed span positions back into a (copied) tree. Healing updates only
 * line numbers — text and hash are untouched, so the receipt itself never changes. */
/** Freshness as a whole-number percentage that never overstates.
 *
 * Plain rounding reports 99.7% as "100%", so a tree with a stale claim announces itself as
 * fully verified and then lists the stale file underneath — the one kind of dishonesty this
 * project cannot afford in its own output. Anything short of perfect is floored, and only a
 * genuinely complete tree is allowed to print 100. */
export const freshnessPct = (freshness: number): number =>
  freshness >= 1 ? 100 : Math.min(99, Math.floor(freshness * 100));

export const applyVerification = (tree: Tree, verification: TreeVerification): Tree => {
  const nodes: Tree['nodes'] = {};
  for (const [id, node] of Object.entries(tree.nodes)) {
    nodes[id] = {
      ...node,
      claims: node.claims.map((claim) => {
        const result = verification.details.get(claim.id);
        if (!result) return claim;
        let spanIdx = 0;
        const citations = claim.citations.map((citation) => {
          if (citation.kind !== 'span') return citation;
          const sv = result.spans[spanIdx++];
          if (!sv?.healed) return citation;
          return { ...citation, span: { ...citation.span, startLine: sv.healed.startLine, endLine: sv.healed.endLine } };
        });
        return { ...claim, citations, verdict: result.verdict };
      }),
    };
  }
  return { ...tree, nodes };
};
