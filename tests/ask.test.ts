import { describe, expect, it } from 'vitest';
import { Bm25Index } from '../src/core/bm25.js';
import { ask } from '../src/query/ask.js';
import { mockProvider } from '../src/llm/mock.js';
import { normalizeText, sha256, splitLines } from '../src/core/hash.js';
import { makeSpan } from '../src/core/gate.js';
import type { Claim, CorpusSnapshot, Tree, TreeNode } from '../src/core/types.js';

describe('Bm25Index', () => {
  it('ranks exact-term documents first, deterministically', () => {
    const index = new Bm25Index([
      { id: 'a', text: 'the gate verifies claims against the corpus' },
      { id: 'b', text: 'chunking splits files into spans' },
      { id: 'c', text: 'gate gate gate verification' },
    ]);
    const hits = index.search('gate verification');
    expect(hits[0].id).toBe('c');
    expect(hits.map((h) => h.id)).toContain('a');
    expect(hits.map((h) => h.id)).not.toContain('b');
  });

  it('returns empty for no-match and empty queries', () => {
    const index = new Bm25Index([{ id: 'a', text: 'hello world' }]);
    expect(index.search('zzz qqq')).toEqual([]);
    expect(index.search('')).toEqual([]);
  });
});

const FILE = ['export function add(a: number, b: number) {', '  return a + b;', '}'].join('\n');

const fixture = (): { tree: Tree; corpus: CorpusSnapshot } => {
  const map = new Map<string, { hash: string; lines: string[] }>();
  const norm = normalizeText(FILE);
  map.set('src/math.ts', { hash: sha256(norm), lines: splitLines(norm) });
  const corpus: CorpusSnapshot = { root: '/fake', files: map };
  const c1: Claim = {
    id: 'leaf:src/math.ts#0',
    text: 'add() returns the sum of two numbers',
    citations: [{ kind: 'span', span: makeSpan('src/math.ts', 1, 3, corpus) }],
    faithfulness: 'supported',
  };
  const leaf: TreeNode = {
    id: 'leaf:src/math.ts', kind: 'leaf', path: 'src/math.ts', title: 'math.ts',
    summary: c1.text, claims: [c1], childIds: [], sourceHash: sha256(norm),
    builtWith: 'llm', builtAt: '',
  };
  const root: TreeNode = {
    id: 'root', kind: 'root', path: '', title: 'demo', summary: '',
    claims: [], childIds: [leaf.id], builtWith: 'llm', builtAt: '',
  };
  const tree: Tree = {
    version: 1, name: 'demo', root: 'root',
    nodes: { [leaf.id]: leaf, root },
    corpusFiles: { 'src/math.ts': { hash: sha256(norm), lines: 3 } },
    builtAt: '', generator: 't',
  };
  return { tree, corpus };
};

describe('ask (BSHR)', () => {
  it('extractive mode returns verified evidence claims as the answer', async () => {
    const { tree, corpus } = fixture();
    const result = await ask('what does add do?', tree, corpus, null);
    expect(result.mode).toBe('extractive');
    expect(result.sentences.length).toBeGreaterThan(0);
    expect(result.sentences[0].verdict).toBe('VERIFIED');
    expect(result.grounding).toBe(1);
  });

  it('numeric evidence refs ([1]-style, small-model friendly) map back to claim ids', async () => {
    const { tree, corpus } = fixture();
    const provider = mockProvider((prompt: string) => {
      if (prompt.includes('"subqueries"')) return '{"subqueries":["add"]}';
      return '{"answer":[{"text":"add() sums two numbers.","refs":[1]},{"text":"Also string-form works.","refs":["[1]"]}]}';
    });
    const result = await ask('what does add do?', tree, corpus, provider);
    expect(result.sentences).toHaveLength(2);
    expect(result.sentences[0].verdict).toBe('VERIFIED');
    expect(result.sentences[1].verdict).toBe('VERIFIED');
    expect(result.unverifiable).toEqual([]);
  });

  it('llm mode: sentences citing real claims are VERIFIED; fabricated refs are quarantined', async () => {
    const { tree, corpus } = fixture();
    const provider = mockProvider((prompt: string) => {
      if (prompt.includes('"subqueries"')) return '{"subqueries":["add function","sum"]}';
      return JSON.stringify({
        answer: [
          { text: 'add() sums two numbers.', refs: ['leaf:src/math.ts#0'] },
          { text: 'It also configures the database.', refs: ['leaf:src/db.ts#0'] },
        ],
      });
    });
    const result = await ask('what does add do?', tree, corpus, provider);
    expect(result.mode).toBe('llm');
    expect(result.sentences).toHaveLength(1);
    expect(result.sentences[0].verdict).toBe('VERIFIED');
    expect(result.unverifiable).toEqual(['It also configures the database.']);
    expect(result.grounding).toBe(1);
    expect(result.subqueries).toContain('add function');
  });

  it('never presents a sentence over a stale claim as VERIFIED', async () => {
    const { tree } = fixture();
    const editedNorm = normalizeText(FILE.replace('a + b', 'a * b'));
    const editedCorpus: CorpusSnapshot = {
      root: '/fake',
      files: new Map([['src/math.ts', { hash: sha256(editedNorm), lines: splitLines(editedNorm) }]]),
    };
    const provider = mockProvider((prompt: string) => {
      if (prompt.includes('"subqueries"')) return '{"subqueries":["add"]}';
      return '{"answer":[{"text":"add() sums two numbers.","refs":["leaf:src/math.ts#0"]}]}';
    });
    const result = await ask('what does add do?', tree, editedCorpus, provider);
    expect(result.sentences[0].verdict).toBe('STALE');
    expect(result.grounding).toBe(0);
  });

  it('provider failure degrades to extractive honestly', async () => {
    const { tree, corpus } = fixture();
    const provider = mockProvider(() => {
      throw new Error('provider down');
    });
    const result = await ask('what does add do?', tree, corpus, provider);
    expect(result.mode).toBe('extractive');
    expect(result.sentences.length).toBeGreaterThan(0);
  });
});
