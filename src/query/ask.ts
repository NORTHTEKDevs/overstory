import { z } from 'zod';
import { Bm25Index } from '../core/bm25.js';
import { verifyClaim } from '../core/gate.js';
import type { Claim, CorpusSnapshot, Tree, Verdict } from '../core/types.js';
import type { ChatProvider } from '../llm/provider.js';

export interface EvidenceItem {
  claimId: string;
  nodeId: string;
  nodePath: string;
  text: string;
  verdict?: Verdict;
  faithfulness?: Claim['faithfulness'];
  spans: Array<{ file: string; startLine: number; endLine: number; text: string }>;
  score: number;
}

export interface AnswerSentence {
  text: string;
  refs: string[]; // claim ids in the tree
  verdict: Verdict;
}

export interface AskResult {
  question: string;
  sentences: AnswerSentence[];
  /** Sentences the model produced that cite nothing verifiable — shown flagged, never mixed in. */
  unverifiable: string[];
  /** VERIFIED fraction of answer sentences, 0..1. */
  grounding: number;
  evidence: EvidenceItem[];
  subqueries: string[];
  mode: 'llm' | 'extractive';
}

const subquerySchema = z.object({ subqueries: z.array(z.string().min(2)).min(1).max(4) });
// refs accepts evidence NUMBERS ([1]-style — reliable for small local models) or raw claim
// ids (API-grade models); both map back to claim ids before gating.
const answerSchema = z.object({
  answer: z
    .array(z.object({ text: z.string().min(3), refs: z.array(z.union([z.number().int(), z.string()])).min(1) }))
    .min(1)
    .max(12),
});

const ANSWER_SYSTEM = `You answer questions about a codebase using ONLY the verified evidence claims provided. Every sentence must cite the claim ids that support it. If the evidence cannot answer the question, say exactly that in one sentence citing the closest evidence — never fill gaps from general knowledge.`;

export const buildClaimIndex = (tree: Tree): { index: Bm25Index; byId: Map<string, { claim: Claim; nodeId: string }> } => {
  const byId = new Map<string, { claim: Claim; nodeId: string }>();
  const index = new Bm25Index();
  for (const node of Object.values(tree.nodes)) {
    for (const claim of node.claims) {
      byId.set(claim.id, { claim, nodeId: node.id });
      index.add({ id: claim.id, text: `${claim.text} ${node.path} ${node.title}` });
    }
  }
  return { index, byId };
};

const evidenceFor = (tree: Tree, hits: Array<{ id: string; score: number }>, byId: Map<string, { claim: Claim; nodeId: string }>): EvidenceItem[] =>
  hits.map(({ id, score }) => {
    const { claim, nodeId } = byId.get(id)!;
    return {
      claimId: id,
      nodeId,
      nodePath: tree.nodes[nodeId].path,
      text: claim.text,
      verdict: claim.verdict,
      faithfulness: claim.faithfulness,
      spans: claim.citations
        .filter((c): c is Extract<typeof c, { kind: 'span' }> => c.kind === 'span')
        .map((c) => ({ file: c.span.file, startLine: c.span.startLine, endLine: c.span.endLine, text: c.span.text })),
      score,
    };
  });

/** BSHR over the tree: Brainstorm subqueries -> Search claims (BM25) -> Hypothesize an
 * answer grounded in evidence claim ids -> Refine through the gate (every sentence
 * re-verified transitively; unverifiable sentences quarantined, never blended in). */
export interface AskPhaseEvent {
  phase: 'brainstorm' | 'search' | 'write' | 'gate';
  subqueries?: string[];
  evidenceCount?: number;
}

export const ask = async (
  question: string,
  tree: Tree,
  corpus: CorpusSnapshot,
  provider: ChatProvider | null,
  opts: { k?: number; onPhase?: (e: AskPhaseEvent) => void } = {},
): Promise<AskResult> => {
  const k = opts.k ?? 8;
  const emit = opts.onPhase ?? (() => {});
  const { index, byId } = buildClaimIndex(tree);

  // Brainstorm
  emit({ phase: 'brainstorm' });
  let subqueries = [question];
  if (provider) {
    try {
      const raw = await provider.chat(
        `Decompose this question about a codebase into 2-4 short search subqueries (keywords, synonyms, likely file/module names). Return ONLY JSON: {"subqueries":["..."]}\n\nQuestion: ${question}`,
        { json: true },
      );
      const first = raw.indexOf('{');
      subqueries = [question, ...subquerySchema.parse(JSON.parse(first >= 0 ? raw.slice(first, raw.lastIndexOf('}') + 1) : raw)).subqueries];
    } catch {
      /* heuristic fallback: the question alone */
    }
  }

  // Search (dedupe, best score wins)
  emit({ phase: 'search', subqueries });
  const merged = new Map<string, number>();
  for (const q of subqueries) {
    for (const hit of index.search(q, k)) {
      merged.set(hit.id, Math.max(merged.get(hit.id) ?? 0, hit.score));
    }
  }
  const hits = [...merged.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  const evidence = evidenceFor(tree, hits, byId);

  // No provider: the verified evidence claims ARE the answer (extractive mode).
  if (!provider) {
    const sentences: AnswerSentence[] = evidence.map((e) => ({
      text: e.text,
      refs: [e.claimId],
      verdict: verifyClaim(byId.get(e.claimId)!.claim, tree, corpus).verdict,
    }));
    const verified = sentences.filter((s) => s.verdict === 'VERIFIED').length;
    return {
      question, sentences, unverifiable: [], evidence, subqueries,
      grounding: sentences.length === 0 ? 0 : verified / sentences.length,
      mode: 'extractive',
    };
  }

  // Hypothesize
  emit({ phase: 'write', evidenceCount: evidence.length });
  const evidenceBlock = evidence.map((e, i) => `[${i + 1}] (${e.nodePath || 'root'}) ${e.text}`).join('\n');
  const sentences: AnswerSentence[] = [];
  const unverifiable: string[] = [];
  const refToClaimId = (r: number | string): string | null => {
    if (typeof r === 'number') return evidence[r - 1]?.claimId ?? null;
    const numeric = /^\[?(\d{1,2})\]?$/u.exec(r.trim());
    if (numeric) return evidence[Number(numeric[1]) - 1]?.claimId ?? null;
    return byId.has(r) ? r : null;
  };
  try {
    const raw = await provider.chat(
      `Answer the question using ONLY this numbered evidence. Every answer sentence cites the evidence numbers that support it.\n\nReturn ONLY JSON: {"answer":[{"text":"one sentence","refs":[1,2]}]}\n\nEVIDENCE:\n${evidenceBlock}\n\nQUESTION: ${question}`,
      { json: true, system: ANSWER_SYSTEM },
    );
    const first = raw.indexOf('{');
    const parsed = answerSchema.parse(JSON.parse(first >= 0 ? raw.slice(first, raw.lastIndexOf('}') + 1) : raw));

    // Refine: every sentence goes through the gate transitively.
    emit({ phase: 'gate' });
    for (const s of parsed.answer) {
      const validRefs = [...new Set(s.refs.map(refToClaimId).filter((r): r is string => r !== null))];
      if (validRefs.length === 0) {
        unverifiable.push(s.text.trim());
        continue;
      }
      const composite: Claim = {
        id: 'answer',
        text: s.text,
        citations: validRefs.map((r) => ({ kind: 'claim' as const, ref: { nodeId: byId.get(r)!.nodeId, claimId: r } })),
      };
      sentences.push({ text: s.text.trim(), refs: validRefs, verdict: verifyClaim(composite, tree, corpus).verdict });
    }
  } catch {
    // Provider failed mid-answer: degrade to extractive honestly.
    return { ...(await ask(question, tree, corpus, null, opts)), subqueries, mode: 'extractive' };
  }

  const verified = sentences.filter((s) => s.verdict === 'VERIFIED').length;
  return {
    question, sentences, unverifiable, evidence, subqueries,
    grounding: sentences.length === 0 ? 0 : verified / sentences.length,
    mode: 'llm',
  };
};
