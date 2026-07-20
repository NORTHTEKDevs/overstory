import { describe, expect, it } from 'vitest';
import { normalizeText, sha256, splitLines } from '../src/core/hash.js';
import { makeSpan, verifyClaim } from '../src/core/gate.js';
import type { Claim, CorpusSnapshot, Tree, TreeNode } from '../src/core/types.js';

const corpusOf = (files: Record<string, string>): CorpusSnapshot => {
  const map = new Map<string, { hash: string; lines: string[] }>();
  for (const [file, raw] of Object.entries(files)) {
    const norm = normalizeText(raw);
    map.set(file, { hash: sha256(norm), lines: splitLines(norm) });
  }
  return { root: '/fake', files: map };
};

const FILE = ['export function add(a: number, b: number) {', '  return a + b;', '}'].join('\n');

const makeTree = (): { tree: Tree; corpus: CorpusSnapshot } => {
  const corpus = corpusOf({ 'src/a.ts': FILE });
  const leafClaim: Claim = {
    id: 'leaf-c1',
    text: 'add() sums numbers',
    citations: [{ kind: 'span', span: makeSpan('src/a.ts', 1, 3, corpus) }],
  };
  const leaf: TreeNode = {
    id: 'leaf1', kind: 'leaf', path: 'src/a.ts', title: 'a.ts', summary: '',
    claims: [leafClaim], childIds: [], builtWith: 'extractive', builtAt: '',
  };
  const tree: Tree = {
    version: 1, name: 't', root: 'leaf1', nodes: { leaf1: leaf },
    corpusFiles: {}, builtAt: '', generator: '',
  };
  return { tree, corpus };
};

describe('gate hardening (ship-gate findings)', () => {
  it('duplicate citations of the same claim verify correctly (common LLM habit, not a cycle)', () => {
    const { tree, corpus } = makeTree();
    const dup: Claim = {
      id: 'answer',
      text: 'add sums, twice cited',
      citations: [
        { kind: 'claim', ref: { nodeId: 'leaf1', claimId: 'leaf-c1' } },
        { kind: 'claim', ref: { nodeId: 'leaf1', claimId: 'leaf-c1' } },
      ],
    };
    expect(verifyClaim(dup, tree, corpus).verdict).toBe('VERIFIED');
  });

  it('diamond grounding (two paths to the same evidence) verifies correctly', () => {
    const { tree, corpus } = makeTree();
    const midA: Claim = { id: 'a', text: 'via A', citations: [{ kind: 'claim', ref: { nodeId: 'leaf1', claimId: 'leaf-c1' } }] };
    const midB: Claim = { id: 'b', text: 'via B', citations: [{ kind: 'claim', ref: { nodeId: 'leaf1', claimId: 'leaf-c1' } }] };
    tree.nodes['mid'] = { id: 'mid', kind: 'dir', path: 'src', title: 'src', summary: '', claims: [midA, midB], childIds: ['leaf1'], builtWith: 'extractive', builtAt: '' };
    const top: Claim = {
      id: 'top',
      text: 'diamond',
      citations: [
        { kind: 'claim', ref: { nodeId: 'mid', claimId: 'a' } },
        { kind: 'claim', ref: { nodeId: 'mid', claimId: 'b' } },
      ],
    };
    expect(verifyClaim(top, tree, corpus).verdict).toBe('VERIFIED');
  });

  it('true cycles terminate and fail closed', () => {
    const { tree, corpus } = makeTree();
    const x: Claim = { id: 'x', text: 'cites y', citations: [{ kind: 'claim', ref: { nodeId: 'cyc', claimId: 'y' } }] };
    const y: Claim = { id: 'y', text: 'cites x', citations: [{ kind: 'claim', ref: { nodeId: 'cyc', claimId: 'x' } }] };
    tree.nodes['cyc'] = { id: 'cyc', kind: 'dir', path: 'c', title: 'c', summary: '', claims: [x, y], childIds: [], builtWith: 'extractive', builtAt: '' };
    const result = verifyClaim(x, tree, corpus); // must terminate
    expect(result.verdict).not.toBe('VERIFIED');
  });

  it('prototype-pollution-style node ids fail closed instead of crashing', () => {
    const { tree, corpus } = makeTree();
    for (const evil of ['__proto__', 'constructor', 'toString']) {
      const claim: Claim = { id: 'e', text: 'evil ref', citations: [{ kind: 'claim', ref: { nodeId: evil, claimId: 'x' } }] };
      expect(verifyClaim(claim, tree, corpus).verdict).toBe('OUT_OF_CORPUS');
    }
  });
});
