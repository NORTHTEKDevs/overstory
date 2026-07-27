import { z } from 'zod';
import { chunkFile } from '../core/chunk.js';
import { makeSpan } from '../core/gate.js';
import type { Claim, CorpusSnapshot, SpanRef } from '../core/types.js';
import type { ChatProvider } from '../llm/provider.js';
import { firstSentence, isExported, precedingDoc, signatureOf } from './docblock.js';

const DECL_RE =
  /^(export\s|function\s|class\s|def\s|async def\s|fn\s|pub\s|impl\s|interface\s|type\s|const\s|let\s|var\s|struct\s|enum\s|mod\s|module\s|public\s|private\s)/u;
const HEADING_RE = /^(#{1,3}) (.+)$/u;

const claimDraftSchema = z.object({
  text: z.string().min(3),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
});
const claimsSchema = z.object({ claims: z.array(claimDraftSchema).min(1).max(12) });
export type ClaimDraft = z.infer<typeof claimDraftSchema>;

export const numberedLines = (lines: string[], startLine: number): string =>
  lines.map((l, i) => `${startLine + i}: ${l}`).join('\n');

const SUMMARIZE_SYSTEM = `You are a precise code/document summarization engine inside a provenance-gated knowledge tree. Every claim you emit will be mechanically verified against the cited lines and audited by humans clicking the receipt. Emit only claims the cited lines directly support. Never speculate.`;

const summarizePrompt = (file: string, span: SpanRef): string => {
  const lines = span.text.split('\n');
  return `Summarize this ${file.endsWith('.md') ? 'documentation section' : 'source code'} into 3-8 atomic factual claims. Each claim must be one self-contained sentence a reader could verify by reading ONLY the cited lines.

Return ONLY JSON: {"claims":[{"text":"...","startLine":N,"endLine":N}]}
Rules: cite the NARROWEST line range that supports the claim; startLine/endLine are the absolute line numbers shown; no claim without its lines.

FILE ${file} (lines ${span.startLine}-${span.endLine}):
${numberedLines(lines, span.startLine)}`;
};

/** Parse provider output into claim drafts. Tolerates prose-wrapped JSON. Throws on failure. */
export const parseClaimDrafts = (raw: string): ClaimDraft[] => {
  const attempt = (s: string): ClaimDraft[] | null => {
    try {
      return claimsSchema.parse(JSON.parse(s)).claims;
    } catch {
      return null;
    }
  };
  const direct = attempt(raw);
  if (direct) return direct;
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const inner = attempt(raw.slice(first, last + 1));
    if (inner) return inner;
  }
  throw new Error('unparseable claims JSON');
};

/** Deterministic no-LLM claims: documented symbols, declarations, headings, or an honest
 * content statement. Supported-by-construction — every claim's text is derived mechanically
 * from the lines it cites, so it can never assert more than the evidence shows.
 *
 * Where a declaration carries a doc comment, the comment and the declaration are cited as a
 * single span. That makes the author's own description the claim, and makes comment rot a
 * first-class gate failure: change the code without updating the comment and the claim goes
 * STALE at the next `overstory verify`. */
export const extractiveClaims = (file: string, span: SpanRef, corpus: CorpusSnapshot): Omit<Claim, 'id'>[] => {
  const lines = span.text.split('\n');
  // Gather every candidate, then keep the most informative. Taking the first N in source
  // order buries a documented function under a run of private constants that happen to be
  // declared above it.
  const candidates: { claim: Omit<Claim, 'id'>; rank: number; line: number }[] = [];
  let consumedThrough = -1; // last index already covered by a documented-symbol claim
  for (let i = 0; i < lines.length; i++) {
    if (i <= consumedThrough) continue;
    const abs = span.startLine + i;
    const heading = HEADING_RE.exec(lines[i]);
    if (heading) {
      // Cite the whole section (to the next heading or span end, capped) so the
      // receipt shows the evidence, not just the headline.
      let end = i + 1;
      while (end < lines.length && !HEADING_RE.test(lines[end]) && end - i < 12) end++;
      candidates.push({
        rank: 0,
        line: abs,
        claim: {
          text: `Documents "${heading[2].trim()}".`,
          citations: [{ kind: 'span', span: makeSpan(file, abs, span.startLine + end - 1, corpus) }],
          faithfulness: 'supported',
        },
      });
      continue;
    }
    if (DECL_RE.test(lines[i])) {
      const sig = signatureOf(lines[i]);
      const doc = precedingDoc(lines, i);
      const exported = isExported(lines[i]);
      if (sig && doc) {
        // One span covering comment through declaration: the pairing is the evidence.
        candidates.push({
          rank: exported ? 0 : 1,
          line: abs,
          claim: {
            text: `\`${sig}\`: ${firstSentence(doc.text)}`,
            citations: [{ kind: 'span', span: makeSpan(file, span.startLine + doc.startIndex, abs, corpus) }],
            faithfulness: 'supported',
          },
        });
        consumedThrough = i;
        continue;
      }
      candidates.push({
        rank: exported ? 2 : 3,
        line: abs,
        claim: {
          text: sig
            ? `${exported ? 'Exports' : 'Declares'} \`${sig}\`.`
            : `Declares \`${lines[i].trim().replace(/\s*[{(=].*$/u, '').slice(0, 100)}\`.`,
          citations: [{ kind: 'span', span: makeSpan(file, abs, abs, corpus) }],
          faithfulness: 'supported',
        },
      });
    }
  }
  // Best first, then restore source order so the ledger still reads top-to-bottom.
  const claims = candidates
    .sort((a, b) => a.rank - b.rank || a.line - b.line)
    .slice(0, 8)
    .sort((a, b) => a.line - b.line)
    .map((c) => c.claim);
  if (claims.length === 0) {
    const firstLine = lines.find((l) => l.trim().length > 0) ?? '';
    claims.push({
      text: `Contains ${lines.length} lines beginning "${firstLine.trim().slice(0, 60)}".`,
      citations: [{ kind: 'span', span: makeSpan(file, span.startLine, span.endLine, corpus) }],
      faithfulness: 'supported',
    });
  }
  return claims;
};

export interface SummarizeResult {
  claims: Claim[];
  /** True when any chunk fell back from LLM to extractive. */
  degraded: boolean;
}

/** Summarize one file into claims. Provider null = pure extractive. LLM chunks that fail
 * JSON parsing get ONE stricter retry, then fall back to extractive for that chunk — a
 * build never dies on a bad response. */
export const summarizeFile = async (
  provider: ChatProvider | null,
  file: string,
  corpus: CorpusSnapshot,
  idPrefix: string,
): Promise<SummarizeResult> => {
  const entry = corpus.files.get(file);
  if (!entry) throw new Error(`summarizeFile: ${file} not in corpus`);
  // An empty (or whitespace-only) file has nothing to claim. Emitting a claim over empty
  // content would be voided by the gate anyway (empty receipts are forgeries by definition)
  // — so don't create it. The explorer's "file is empty" state covers the rendering.
  if (entry.lines.every((l) => l.trim() === '')) return { claims: [], degraded: false };
  const spans = chunkFile(file, entry.lines.join('\n'));
  const out: Omit<Claim, 'id'>[] = [];
  let degraded = false;

  for (const span of spans) {
    if (!provider) {
      out.push(...extractiveClaims(file, span, corpus));
      continue;
    }
    let drafts: ClaimDraft[] | null = null;
    for (let attempt = 0; attempt < 2 && !drafts; attempt++) {
      try {
        const raw = await provider.chat(
          attempt === 0
            ? summarizePrompt(file, span)
            : `${summarizePrompt(file, span)}\n\nYour previous output was not valid JSON. Return ONLY the JSON object, nothing else.`,
          { json: true, system: SUMMARIZE_SYSTEM },
        );
        drafts = parseClaimDrafts(raw);
      } catch {
        drafts = null;
      }
    }
    if (!drafts) {
      degraded = true;
      out.push(...extractiveClaims(file, span, corpus));
      continue;
    }
    const total = entry.lines.length;
    const before = out.length;
    for (const d of drafts) {
      if (d.startLine > total || d.endLine < d.startLine) continue; // hallucinated range: drop
      const span = makeSpan(file, d.startLine, Math.min(d.endLine, total), corpus);
      if (span.text.trim().length === 0) continue; // cites a blank line: can never verify, drop now
      out.push({
        text: d.text.trim(),
        citations: [{ kind: 'span', span }],
        faithfulness: 'unchecked',
      });
    }
    if (out.length === before) {
      // Every draft had a hallucinated range — reject the batch loudly, not silently.
      degraded = true;
      out.push(...extractiveClaims(file, span, corpus));
    }
  }

  return {
    claims: out.map((c, i) => ({ ...c, id: `${idPrefix}#${i}` })),
    degraded,
  };
};
