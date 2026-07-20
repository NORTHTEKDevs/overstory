import { z } from 'zod';
import { makeSpan } from '../core/gate.js';
import type { Claim, CorpusSnapshot } from '../core/types.js';
import type { ChatProvider } from '../llm/provider.js';
import { numberedLines } from './summarize.js';

// Local models emit `null` and empty strings for omitted fields — nullish(), never
// optional()-only, or the whole critique silently dies at the parse (live-verified failure
// mode: qwen2.5:14b returns "revisedStartLine": null on SUPPORTED claims).
const critiqueSchema = z.object({
  claims: z.array(
    z.object({
      id: z.string(),
      verdict: z.enum(['SUPPORTED', 'UNSUPPORTED']),
      revisedText: z.string().nullish(),
      revisedStartLine: z.number().int().min(1).nullish(),
      revisedEndLine: z.number().int().min(1).nullish(),
    }),
  ),
  missing: z
    .array(z.object({ text: z.string().nullish(), startLine: z.number().int().min(1).nullish(), endLine: z.number().int().min(1).nullish() }))
    .nullish(),
});

const CRITIQUE_SYSTEM = `You are an adversarial fact-checker for a provenance-gated knowledge tree. Your job is to REFUTE claims: a claim is SUPPORTED only if a skeptical reader would agree the cited lines directly state or straightforwardly imply it. Judge only against the cited lines shown — not general knowledge. Flag overreach, speculation, and misattribution. Do not reward fluent wording.`;

const critiquePrompt = (file: string, sourceLines: string[], claims: Claim[]): string => {
  const claimBlock = claims
    .map((c) => {
      const spans = c.citations
        .filter((x): x is Extract<typeof x, { kind: 'span' }> => x.kind === 'span')
        .map((x) => `lines ${x.span.startLine}-${x.span.endLine}`)
        .join(', ');
      return `- id=${c.id} [cites ${spans || 'NOTHING'}]: ${c.text}`;
    })
    .join('\n');
  return `Fact-check each claim against the source. For UNSUPPORTED claims, provide a corrected revisedText + revised line range when a defensible correction exists; otherwise leave it flagged. List up to 3 important facts the claims MISS (with their line ranges).

Return ONLY JSON: {"claims":[{"id":"...","verdict":"SUPPORTED"|"UNSUPPORTED","revisedText":"...?","revisedStartLine":N?,"revisedEndLine":N?}],"missing":[{"text":"...","startLine":N,"endLine":N}]}

CLAIMS:
${claimBlock}

SOURCE ${file}:
${numberedLines(sourceLines, 1)}`;
};

export interface ReflexionOptions {
  maxRounds?: number;
}

export interface ReflexionResult {
  claims: Claim[];
  rounds: number;
  stop: 'converged' | 'max-rounds' | 'no-progress' | 'critique-failed';
}

/** Reflexion refinement (Shinn 2023 shape, RAIN stop discipline): critique -> apply
 * revisions -> re-critique revised claims. UNSUPPORTED claims without a revision stay
 * visible and flagged (abstention over confident prose, never silent deletion). A failed
 * critique leaves faithfulness 'unchecked' — honest, not upgraded. */
export const refineClaims = async (
  provider: ChatProvider,
  file: string,
  claims: Claim[],
  corpus: CorpusSnapshot,
  opts: ReflexionOptions = {},
): Promise<ReflexionResult> => {
  const maxRounds = opts.maxRounds ?? 1;
  const entry = corpus.files.get(file);
  if (!entry || claims.length === 0) return { claims, rounds: 0, stop: 'converged' };

  let working = claims.map((c) => ({ ...c }));
  let previousUnchecked = -1;
  let rounds = 0;

  for (let round = 0; round < maxRounds; round++) {
    const targets = working.filter((c) => c.faithfulness !== 'supported');
    if (targets.length === 0) return { claims: working, rounds, stop: 'converged' };

    let parsed: z.infer<typeof critiqueSchema> | null = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const raw = await provider.chat(
          attempt === 0
            ? critiquePrompt(file, entry.lines, targets)
            : `${critiquePrompt(file, entry.lines, targets)}\n\nYour previous output was not valid JSON for the requested shape. Return ONLY the JSON object.`,
          { json: true, system: CRITIQUE_SYSTEM },
        );
        const first = raw.indexOf('{');
        const last = raw.lastIndexOf('}');
        parsed = critiqueSchema.parse(JSON.parse(first >= 0 ? raw.slice(first, last + 1) : raw));
      } catch {
        parsed = null;
      }
    }
    if (!parsed) return { claims: working, rounds, stop: 'critique-failed' };
    rounds += 1;

    const byId = new Map(parsed.claims.map((v) => [v.id, v]));
    const total = entry.lines.length;
    working = working.map((c) => {
      const v = byId.get(c.id);
      if (!v || c.faithfulness === 'supported') return c;
      if (v.verdict === 'SUPPORTED') return { ...c, faithfulness: 'supported' as const };
      const revised = v.revisedText?.trim();
      if (revised && revised.length >= 3 && v.revisedStartLine && v.revisedEndLine && v.revisedStartLine <= total) {
        return {
          ...c,
          text: revised,
          citations: [
            { kind: 'span' as const, span: makeSpan(file, v.revisedStartLine, Math.min(v.revisedEndLine, total), corpus) },
          ],
          faithfulness: 'unchecked' as const, // revision must survive its own critique
        };
      }
      return { ...c, faithfulness: 'unsupported' as const };
    });

    for (const m of parsed.missing ?? []) {
      const text = m.text?.trim();
      if (!text || text.length < 3 || !m.startLine || !m.endLine || m.startLine > total) continue;
      const span = makeSpan(file, m.startLine, Math.min(m.endLine, total), corpus);
      if (span.text.trim().length === 0) continue; // a blank line grounds nothing
      working.push({
        id: `${claims[0].id.split('#')[0]}#m${working.length}`,
        text,
        citations: [{ kind: 'span', span }],
        faithfulness: 'unchecked',
      });
    }

    const unchecked = working.filter((c) => c.faithfulness === 'unchecked').length;
    if (unchecked === 0) return { claims: working, rounds, stop: 'converged' };
    if (unchecked === previousUnchecked) return { claims: working, rounds, stop: 'no-progress' };
    previousUnchecked = unchecked;
  }
  return { claims: working, rounds, stop: 'max-rounds' };
};
