import { describe, expect, it } from 'vitest';
import { normalizeText, sha256, splitLines } from '../src/core/hash.js';
import { verifyClaim } from '../src/core/gate.js';
import { extractiveClaims, parseClaimDrafts, summarizeFile } from '../src/build/summarize.js';
import { mockProvider } from '../src/llm/mock.js';
import type { CorpusSnapshot, Tree } from '../src/core/types.js';
import { chunkFile } from '../src/core/chunk.js';

const corpusOf = (files: Record<string, string>): CorpusSnapshot => {
  const map = new Map<string, { hash: string; lines: string[] }>();
  for (const [file, raw] of Object.entries(files)) {
    const norm = normalizeText(raw);
    map.set(file, { hash: sha256(norm), lines: splitLines(norm) });
  }
  return { root: '/fake', files: map };
};

const emptyTree: Tree = { version: 1, name: 't', root: 'r', nodes: {}, corpusFiles: {}, builtAt: '', generator: '' };

const FILE = ['export function add(a: number, b: number) {', '  return a + b;', '}', '', '# not a heading in ts', 'export const VERSION = "1.0";'].join('\n');

describe('parseClaimDrafts', () => {
  it('parses clean JSON', () => {
    const drafts = parseClaimDrafts('{"claims":[{"text":"adds numbers","startLine":1,"endLine":3}]}');
    expect(drafts).toHaveLength(1);
  });

  it('tolerates prose-wrapped JSON', () => {
    const drafts = parseClaimDrafts('Here you go:\n{"claims":[{"text":"adds numbers","startLine":1,"endLine":3}]}\nDone!');
    expect(drafts).toHaveLength(1);
  });

  it('throws on garbage', () => {
    expect(() => parseClaimDrafts('no json here')).toThrow();
  });
});

describe('extractiveClaims', () => {
  it('produces declaration claims that pass the gate, supported-by-construction', () => {
    const corpus = corpusOf({ 'src/a.ts': FILE });
    const [span] = chunkFile('src/a.ts', FILE);
    const claims = extractiveClaims('src/a.ts', span, corpus).map((c, i) => ({ ...c, id: `x#${i}` }));
    expect(claims.length).toBeGreaterThanOrEqual(2);
    for (const claim of claims) {
      expect(claim.faithfulness).toBe('supported');
      expect(verifyClaim(claim, emptyTree, corpus).verdict).toBe('VERIFIED');
    }
  });

  it('is deterministic', () => {
    const corpus = corpusOf({ 'src/a.ts': FILE });
    const [span] = chunkFile('src/a.ts', FILE);
    const a = extractiveClaims('src/a.ts', span, corpus);
    const b = extractiveClaims('src/a.ts', span, corpus);
    expect(a).toEqual(b);
  });

  it('falls back to an honest content claim when nothing is recognizable', () => {
    const corpus = corpusOf({ 'notes.txt': 'just some prose\nmore prose' });
    const [span] = chunkFile('notes.txt', 'just some prose\nmore prose');
    const claims = extractiveClaims('notes.txt', span, corpus);
    expect(claims).toHaveLength(1);
    expect(claims[0].text).toContain('2 lines');
  });
});

describe('summarizeFile', () => {
  it('LLM path: valid JSON becomes gate-passing claims with unchecked faithfulness', async () => {
    const corpus = corpusOf({ 'src/a.ts': FILE });
    const provider = mockProvider(['{"claims":[{"text":"add() returns the sum of two numbers","startLine":1,"endLine":3}]}']);
    const { claims, degraded } = await summarizeFile(provider, 'src/a.ts', corpus, 'leaf:src/a.ts');
    expect(degraded).toBe(false);
    expect(claims).toHaveLength(1);
    expect(claims[0].faithfulness).toBe('unchecked');
    expect(claims[0].id).toBe('leaf:src/a.ts#0');
    expect(verifyClaim(claims[0], emptyTree, corpus).verdict).toBe('VERIFIED');
  });

  it('malformed JSON: one stricter retry, then extractive fallback (build never dies)', async () => {
    const corpus = corpusOf({ 'src/a.ts': FILE });
    const provider = mockProvider(['not json at all', 'still not json']);
    const { claims, degraded } = await summarizeFile(provider, 'src/a.ts', corpus, 'leaf:src/a.ts');
    expect(provider.prompts).toHaveLength(2);
    expect(provider.prompts[1]).toContain('not valid JSON');
    expect(degraded).toBe(true);
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => c.faithfulness === 'supported')).toBe(true);
  });

  it('drops claims with hallucinated line ranges', async () => {
    const corpus = corpusOf({ 'src/a.ts': FILE });
    const provider = mockProvider([
      '{"claims":[{"text":"real claim","startLine":1,"endLine":2},{"text":"cites beyond EOF","startLine":900,"endLine":905}]}',
    ]);
    const { claims, degraded } = await summarizeFile(provider, 'src/a.ts', corpus, 'p');
    expect(claims).toHaveLength(1);
    expect(claims[0].text).toBe('real claim');
    expect(degraded).toBe(false); // one valid claim survived — not a degraded chunk
  });

  it('flags degraded + falls back to extractive when EVERY draft has a hallucinated range', async () => {
    const corpus = corpusOf({ 'src/a.ts': FILE });
    const provider = mockProvider([
      '{"claims":[{"text":"all invalid","startLine":900,"endLine":905},{"text":"also invalid","startLine":800,"endLine":801}]}',
    ]);
    const { claims, degraded } = await summarizeFile(provider, 'src/a.ts', corpus, 'p');
    expect(degraded).toBe(true);
    expect(claims.length).toBeGreaterThan(0); // extractive fallback, never zero claims silently
    expect(claims.every((c) => c.faithfulness === 'supported')).toBe(true);
  });

  it('extractive path when provider is null', async () => {
    const corpus = corpusOf({ 'src/a.ts': FILE });
    const { claims, degraded } = await summarizeFile(null, 'src/a.ts', corpus, 'p');
    expect(degraded).toBe(false);
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => c.faithfulness === 'supported')).toBe(true);
  });
});
