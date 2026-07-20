import { describe, expect, it } from 'vitest';
import { normalizeText, sha256, splitLines } from '../src/core/hash.js';
import { makeSpan } from '../src/core/gate.js';
import { refineClaims } from '../src/build/reflexion.js';
import { mockProvider } from '../src/llm/mock.js';
import type { Claim, CorpusSnapshot } from '../src/core/types.js';

const corpusOf = (files: Record<string, string>): CorpusSnapshot => {
  const map = new Map<string, { hash: string; lines: string[] }>();
  for (const [file, raw] of Object.entries(files)) {
    const norm = normalizeText(raw);
    map.set(file, { hash: sha256(norm), lines: splitLines(norm) });
  }
  return { root: '/fake', files: map };
};

const FILE = ['export function add(a: number, b: number) {', '  return a + b;', '}'].join('\n');

const seedClaim = (corpus: CorpusSnapshot, text: string): Claim => ({
  id: 'leaf:src/a.ts#0',
  text,
  citations: [{ kind: 'span', span: makeSpan('src/a.ts', 1, 3, corpus) }],
  faithfulness: 'unchecked',
});

describe('refineClaims (Reflexion)', () => {
  it('ADVERSARIAL SEMANTIC-MISMATCH CONTROL: true span + false claim exits unsupported, never silently supported', async () => {
    const corpus = corpusOf({ 'src/a.ts': FILE });
    // The claim cites REAL, UNCHANGED lines (gate says VERIFIED) but the text is false.
    const falseClaim = seedClaim(corpus, 'add() multiplies two numbers and caches the result');
    const critic = mockProvider(['{"claims":[{"id":"leaf:src/a.ts#0","verdict":"UNSUPPORTED"}]}']);
    const result = await refineClaims(critic, 'src/a.ts', [falseClaim], corpus);
    expect(result.claims[0].faithfulness).toBe('unsupported');
    expect(result.claims).toHaveLength(1); // kept visible + flagged, not deleted
  });

  it('marks supported claims and converges', async () => {
    const corpus = corpusOf({ 'src/a.ts': FILE });
    const claim = seedClaim(corpus, 'add() returns the sum of a and b');
    const critic = mockProvider(['{"claims":[{"id":"leaf:src/a.ts#0","verdict":"SUPPORTED"}]}']);
    const result = await refineClaims(critic, 'src/a.ts', [claim], corpus);
    expect(result.claims[0].faithfulness).toBe('supported');
    expect(result.stop).toBe('converged');
    expect(result.rounds).toBe(1);
  });

  it('applies a revision, then the revision must survive its own critique round', async () => {
    const corpus = corpusOf({ 'src/a.ts': FILE });
    const claim = seedClaim(corpus, 'add() multiplies numbers');
    const critic = mockProvider([
      '{"claims":[{"id":"leaf:src/a.ts#0","verdict":"UNSUPPORTED","revisedText":"add() returns the sum of a and b","revisedStartLine":1,"revisedEndLine":3}]}',
      '{"claims":[{"id":"leaf:src/a.ts#0","verdict":"SUPPORTED"}]}',
    ]);
    const result = await refineClaims(critic, 'src/a.ts', [claim], corpus, { maxRounds: 2 });
    expect(result.claims[0].text).toBe('add() returns the sum of a and b');
    expect(result.claims[0].faithfulness).toBe('supported');
    expect(result.stop).toBe('converged');
    expect(result.rounds).toBe(2);
  });

  it('adds missing facts as new unchecked claims', async () => {
    const corpus = corpusOf({ 'src/a.ts': FILE });
    const claim = seedClaim(corpus, 'add() returns the sum of a and b');
    const critic = mockProvider([
      '{"claims":[{"id":"leaf:src/a.ts#0","verdict":"SUPPORTED"}],"missing":[{"text":"add() takes exactly two number parameters","startLine":1,"endLine":1}]}',
    ]);
    const result = await refineClaims(critic, 'src/a.ts', [claim], corpus, { maxRounds: 1 });
    expect(result.claims).toHaveLength(2);
    expect(result.claims[1].faithfulness).toBe('unchecked');
    expect(result.stop).toBe('max-rounds'); // budget spent with an unchecked claim left — honest
  });

  it('LIVE-VERIFIED REGRESSION: local models emit null/empty for omitted fields — must parse, not silently kill the critique tier', async () => {
    const corpus = corpusOf({ 'src/a.ts': FILE });
    const claim = seedClaim(corpus, 'add() returns the sum of a and b');
    // Exact shape captured from qwen2.5:14b live on 2026-07-19.
    const critic = mockProvider([
      JSON.stringify({
        claims: [{ id: 'leaf:src/a.ts#0', verdict: 'SUPPORTED', revisedText: '', revisedStartLine: null, revisedEndLine: null }],
        missing: [{ text: null, startLine: 1, endLine: 1 }],
      }),
    ]);
    const result = await refineClaims(critic, 'src/a.ts', [claim], corpus);
    expect(result.stop).toBe('converged');
    expect(result.claims).toHaveLength(1); // null-text missing entry filtered, not crashed on
    expect(result.claims[0].faithfulness).toBe('supported');
  });

  it('retries once on unparseable critique output before degrading honestly', async () => {
    const corpus = corpusOf({ 'src/a.ts': FILE });
    const claim = seedClaim(corpus, 'add() returns the sum of a and b');
    const critic = mockProvider([
      'not json at all',
      '{"claims":[{"id":"leaf:src/a.ts#0","verdict":"SUPPORTED"}]}',
    ]);
    const result = await refineClaims(critic, 'src/a.ts', [claim], corpus);
    expect(critic.prompts).toHaveLength(2);
    expect(result.claims[0].faithfulness).toBe('supported');
  });

  it('critique failure leaves faithfulness unchecked (honest, never upgraded)', async () => {
    const corpus = corpusOf({ 'src/a.ts': FILE });
    const claim = seedClaim(corpus, 'add() returns the sum of a and b');
    const critic = mockProvider(['total garbage, not JSON']);
    const result = await refineClaims(critic, 'src/a.ts', [claim], corpus);
    expect(result.claims[0].faithfulness).toBe('unchecked');
    expect(result.stop).toBe('critique-failed');
  });

  it('terminates at max rounds when the critic keeps revising', async () => {
    const corpus = corpusOf({ 'src/a.ts': FILE });
    const claim = seedClaim(corpus, 'wrong');
    const critic = mockProvider((_prompt) =>
      '{"claims":[{"id":"leaf:src/a.ts#0","verdict":"UNSUPPORTED","revisedText":"still evolving","revisedStartLine":1,"revisedEndLine":2}]}',
    );
    const result = await refineClaims(critic, 'src/a.ts', [claim], corpus, { maxRounds: 3 });
    expect(result.stop).toBe('no-progress'); // same unchecked count two rounds running
    expect(result.rounds).toBeLessThanOrEqual(3);
  });
});
