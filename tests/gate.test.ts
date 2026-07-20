import { describe, expect, it } from 'vitest';
import { normalizeText, sha256, splitLines } from '../src/core/hash.js';
import { makeSpan, verifyClaim, verifySpan, verifyTree } from '../src/core/gate.js';
import type { Claim, CorpusSnapshot, Tree, TreeNode } from '../src/core/types.js';

const corpusOf = (files: Record<string, string>): CorpusSnapshot => {
  const map = new Map<string, { hash: string; lines: string[] }>();
  for (const [file, raw] of Object.entries(files)) {
    const norm = normalizeText(raw);
    map.set(file, { hash: sha256(norm), lines: splitLines(norm) });
  }
  return { root: '/fake', files: map };
};

const FILE_A = ['export function add(a, b) {', '  return a + b;', '}', '', 'export function sub(a, b) {', '  return a - b;', '}'].join('\n');

const claimWith = (citations: Claim['citations']): Claim => ({ id: 'c1', text: 'adds two numbers', citations });

describe('verifySpan', () => {
  it('VERIFIED for an accurate span', () => {
    const corpus = corpusOf({ 'src/a.ts': FILE_A });
    const span = makeSpan('src/a.ts', 1, 3, corpus);
    expect(verifySpan(span, corpus).verdict).toBe('VERIFIED');
  });

  it('heals when unrelated lines are inserted above the span (position-shift robustness)', () => {
    const corpus = corpusOf({ 'src/a.ts': FILE_A });
    const span = makeSpan('src/a.ts', 5, 7, corpus); // the sub() block
    const edited = corpusOf({ 'src/a.ts': '// new comment\n// another\n' + FILE_A });
    const result = verifySpan(span, edited);
    expect(result.verdict).toBe('VERIFIED');
    expect(result.healed).toEqual({ startLine: 7, endLine: 9 });
  });

  it('STALE when the cited text no longer exists anywhere in the file', () => {
    const corpus = corpusOf({ 'src/a.ts': FILE_A });
    const span = makeSpan('src/a.ts', 1, 3, corpus);
    const edited = corpusOf({ 'src/a.ts': FILE_A.replace('a + b', 'a * b') });
    expect(verifySpan(span, edited).verdict).toBe('STALE');
  });

  it('OUT_OF_CORPUS when the cited file does not exist', () => {
    const corpus = corpusOf({ 'src/a.ts': FILE_A });
    const span = makeSpan('src/a.ts', 1, 3, corpus);
    expect(verifySpan(span, corpusOf({})).verdict).toBe('OUT_OF_CORPUS');
  });

  it('fabricated span text (never existed in file) is never VERIFIED', () => {
    const corpus = corpusOf({ 'src/a.ts': FILE_A });
    const forged = { file: 'src/a.ts', startLine: 1, endLine: 1, text: 'export function evil() {}', contentHash: sha256('export function evil() {}') };
    expect(verifySpan(forged, corpus).verdict).not.toBe('VERIFIED');
  });
});

describe('verifyClaim', () => {
  const emptyTree: Tree = { version: 1, name: 't', root: 'r', nodes: {}, corpusFiles: {}, builtAt: '', generator: '' };

  it('UNGROUNDED when the claim has no citations', () => {
    const corpus = corpusOf({ 'src/a.ts': FILE_A });
    expect(verifyClaim(claimWith([]), emptyTree, corpus).verdict).toBe('UNGROUNDED');
  });

  it('UNGROUNDED when a receipt is internally inconsistent (text/hash mismatch = forged)', () => {
    const corpus = corpusOf({ 'src/a.ts': FILE_A });
    const span = { ...makeSpan('src/a.ts', 1, 3, corpus), contentHash: sha256('something else') };
    expect(verifyClaim(claimWith([{ kind: 'span', span }]), emptyTree, corpus).verdict).toBe('UNGROUNDED');
  });

  it('fail-closed: worst span verdict wins (one good + one missing-file span -> OUT_OF_CORPUS)', () => {
    const corpus = corpusOf({ 'src/a.ts': FILE_A });
    const good = makeSpan('src/a.ts', 1, 3, corpus);
    const gone = { file: 'src/missing.ts', startLine: 1, endLine: 1, text: 'x', contentHash: sha256('x') };
    const claim = claimWith([{ kind: 'span', span: good }, { kind: 'span', span: gone }]);
    expect(verifyClaim(claim, emptyTree, corpus).verdict).toBe('OUT_OF_CORPUS');
  });

  it('good + stale spans -> STALE', () => {
    const corpus = corpusOf({ 'src/a.ts': FILE_A });
    const good = makeSpan('src/a.ts', 5, 7, corpus);
    const stale = makeSpan('src/a.ts', 1, 3, corpus);
    const edited = corpusOf({ 'src/a.ts': FILE_A.replace('a + b', 'a * b') });
    const claim = claimWith([{ kind: 'span', span: good }, { kind: 'span', span: stale }]);
    expect(verifyClaim(claim, emptyTree, edited).verdict).toBe('STALE');
  });
});

describe('interior claims (claim -> child claim citations)', () => {
  const buildTree = (): { tree: Tree; corpus: CorpusSnapshot } => {
    const corpus = corpusOf({ 'src/a.ts': FILE_A });
    const leafClaim: Claim = { id: 'leaf-c1', text: 'add() sums numbers', citations: [{ kind: 'span', span: makeSpan('src/a.ts', 1, 3, corpus) }] };
    const leaf: TreeNode = { id: 'leaf1', kind: 'leaf', path: 'src/a.ts', title: 'a.ts', summary: '', claims: [leafClaim], childIds: [], builtWith: 'extractive', builtAt: '' };
    const dirClaim: Claim = { id: 'dir-c1', text: 'src contains math utilities', citations: [{ kind: 'claim', ref: { nodeId: 'leaf1', claimId: 'leaf-c1' } }] };
    const dir: TreeNode = { id: 'dir1', kind: 'root', path: '', title: 'root', summary: '', claims: [dirClaim], childIds: ['leaf1'], builtWith: 'extractive', builtAt: '' };
    const tree: Tree = { version: 1, name: 't', root: 'dir1', nodes: { leaf1: leaf, dir1: dir }, corpusFiles: {}, builtAt: '', generator: '' };
    return { tree, corpus };
  };

  it('VERIFIED when the cited child claim verifies', () => {
    const { tree, corpus } = buildTree();
    expect(verifyClaim(tree.nodes['dir1'].claims[0], tree, corpus).verdict).toBe('VERIFIED');
  });

  it('staleness propagates upward through claim citations', () => {
    const { tree } = buildTree();
    const edited = corpusOf({ 'src/a.ts': FILE_A.replace('a + b', 'a * b') });
    expect(verifyClaim(tree.nodes['dir1'].claims[0], tree, edited).verdict).toBe('STALE');
  });

  it('OUT_OF_CORPUS when the cited child claim does not exist', () => {
    const { tree, corpus } = buildTree();
    const bad: Claim = { id: 'x', text: 'cites nothing real', citations: [{ kind: 'claim', ref: { nodeId: 'leaf1', claimId: 'no-such-claim' } }] };
    expect(verifyClaim(bad, tree, corpus).verdict).toBe('OUT_OF_CORPUS');
  });
});

describe('verifyTree', () => {
  it('reports freshness fraction and per-node counts', () => {
    const corpus = corpusOf({ 'src/a.ts': FILE_A });
    const c1: Claim = { id: 'c1', text: 'ok', citations: [{ kind: 'span', span: makeSpan('src/a.ts', 1, 3, corpus) }] };
    const c2: Claim = { id: 'c2', text: 'ungrounded', citations: [] };
    const leaf: TreeNode = { id: 'n1', kind: 'leaf', path: 'src/a.ts', title: 'a.ts', summary: '', claims: [c1, c2], childIds: [], builtWith: 'extractive', builtAt: '' };
    const tree: Tree = { version: 1, name: 't', root: 'n1', nodes: { n1: leaf }, corpusFiles: {}, builtAt: '', generator: '' };
    const result = verifyTree(tree, corpus);
    expect(result.verdicts.get('c1')).toBe('VERIFIED');
    expect(result.verdicts.get('c2')).toBe('UNGROUNDED');
    expect(result.freshness).toBeCloseTo(0.5);
    expect(result.byNode.get('n1')).toEqual({ verified: 1, total: 2 });
  });
});
