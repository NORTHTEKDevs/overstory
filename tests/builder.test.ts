import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTree, verifyExisting } from '../src/build/builder.js';
import { mockProvider } from '../src/llm/mock.js';
import { treePath, partialPath } from '../src/core/store.js';

let root: string;

const smartMock = () =>
  mockProvider((prompt: string) => {
    if (prompt.startsWith('Fact-check each claim')) {
      const ids = [...prompt.matchAll(/id=(\S+) /gu)].map((m) => m[1]);
      return JSON.stringify({ claims: ids.map((id) => ({ id, verdict: 'SUPPORTED' })) });
    }
    if (prompt.includes('"refs"')) {
      const ids = [...prompt.matchAll(/\[([^\]\s]+#[^\]\s]+)\]/gu)].map((m) => m[1]);
      return JSON.stringify({ claims: [{ text: 'This module groups related functionality.', refs: ids.slice(0, 3) }] });
    }
    return JSON.stringify({ claims: [{ text: 'llm summary claim', startLine: 1, endLine: 1 }] });
  });

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'overstory-build-'));
  mkdirSync(join(root, 'src', 'util'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# Demo\nA demo repo.\n## Install\nnpm i\n');
  writeFileSync(join(root, 'src', 'math.ts'), 'export function add(a: number, b: number) {\n  return a + b;\n}\n');
  writeFileSync(join(root, 'src', 'util', 'str.ts'), 'export function upper(s: string) {\n  return s.toUpperCase();\n}\n');
  writeFileSync(join(root, 'notes.txt'), 'plain notes about the demo\nsecond line\n');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('buildTree E2E (order-dependent sequence)', () => {
  it('extractive build: full tree, 100% VERIFIED, saved atomically', async () => {
    const { tree, verification, rebuiltLeaves } = await buildTree(root, { provider: null });
    expect(rebuiltLeaves).toBe(4);
    expect(Object.keys(tree.nodes).sort()).toEqual([
      'dir:src', 'dir:src/util', 'leaf:README.md', 'leaf:notes.txt',
      'leaf:src/math.ts', 'leaf:src/util/str.ts', 'root',
    ]);
    expect(verification.freshness).toBe(1);
    for (const node of Object.values(tree.nodes)) {
      for (const claim of node.claims) expect(claim.verdict).toBe('VERIFIED');
    }
    expect(existsSync(treePath(root))).toBe(true);
    expect(existsSync(partialPath(root))).toBe(false);
  });

  it('second extractive build reuses every hash-matched leaf', async () => {
    const { reusedLeaves, rebuiltLeaves } = await buildTree(root, { provider: null });
    expect(reusedLeaves).toBe(4);
    expect(rebuiltLeaves).toBe(0);
  });

  it('provider available upgrades extractive leaves; Reflexion marks claims supported', async () => {
    const provider = smartMock();
    const { tree, reusedLeaves, rebuiltLeaves, verification } = await buildTree(root, { provider });
    expect(rebuiltLeaves).toBe(4);
    expect(reusedLeaves).toBe(0);
    expect(verification.freshness).toBe(1);
    const leaf = tree.nodes['leaf:src/math.ts'];
    expect(leaf.builtWith).toBe('llm');
    expect(leaf.claims[0].faithfulness).toBe('supported');
    // interior nodes ground their claims in child claims
    const dir = tree.nodes['dir:src'];
    expect(dir.claims[0].citations[0].kind).toBe('claim');
    expect(dir.claims[0].verdict).toBe('VERIFIED');
  });

  it('rebuild with provider reuses llm leaves (no re-summarization prompts)', async () => {
    const provider = smartMock();
    const { reusedLeaves, rebuiltLeaves } = await buildTree(root, { provider });
    expect(reusedLeaves).toBe(4);
    expect(rebuiltLeaves).toBe(0);
    expect(provider.prompts.some((p) => p.startsWith('Summarize this'))).toBe(false);
    expect(provider.prompts.some((p) => p.includes('"refs"'))).toBe(true); // dirs still roll up
  });

  it('tampering a cited line stales exactly that file; rebuild recovers', async () => {
    const original = readFileSync(join(root, 'src', 'math.ts'), 'utf8');
    writeFileSync(join(root, 'src', 'math.ts'), original.replace('function add', 'function addAll'));
    const result = await verifyExisting(root);
    expect(result).not.toBeNull();
    expect(result!.staleFiles).toEqual(['src/math.ts']);
    expect(result!.verification.freshness).toBeLessThan(1);

    const provider = smartMock();
    const { rebuiltLeaves, reusedLeaves, verification } = await buildTree(root, { provider });
    expect(rebuiltLeaves).toBe(1);
    expect(reusedLeaves).toBe(3);
    expect(verification.freshness).toBe(1);
  });

  it('edits ABOVE a cited span heal line numbers without staling (verify-only)', async () => {
    const original = readFileSync(join(root, 'README.md'), 'utf8');
    writeFileSync(join(root, 'README.md'), 'intro line added later\n' + original);
    const result = await verifyExisting(root);
    expect(result!.verification.freshness).toBe(1);
    expect(result!.staleFiles).toEqual([]);
    const readme = result!.tree.nodes['leaf:README.md'];
    const spanCitation = readme.claims[0].citations.find((c) => c.kind === 'span');
    expect(spanCitation).toBeDefined();
    expect(spanCitation!.kind === 'span' && spanCitation!.span.startLine).toBe(2); // healed +1
  });

  it('a corrupt tree file is never trusted: verifyExisting returns null', async () => {
    writeFileSync(treePath(root), '{"not":"a tree"}');
    expect(await verifyExisting(root)).toBeNull();
  });
});
