import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTree, verifyExisting } from '../src/build/builder.js';
import { partialPath, treePath } from '../src/core/store.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'overstory-hard-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# Hardening\nDemo.\n');
  writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
  writeFileSync(join(root, 'src', 'b.ts'), 'export const b = 2;\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('builder hardening (ship-gate findings)', () => {
  it('a killed build resumes from its partial checkpoint (the advertised guarantee)', async () => {
    await buildTree(root, { provider: null });
    // Simulate a kill after checkpointing: the partial exists, the final tree does not.
    renameSync(treePath(root), partialPath(root));
    const { reusedLeaves, rebuiltLeaves } = await buildTree(root, { provider: null });
    expect(reusedLeaves).toBe(3);
    expect(rebuiltLeaves).toBe(0);
    expect(existsSync(partialPath(root))).toBe(false); // cleaned up after completion
  });

  it('refuses to run while another live build holds the lock', async () => {
    mkdirSync(join(root, '.overstory'), { recursive: true });
    writeFileSync(join(root, '.overstory', 'build.lock'), JSON.stringify({ pid: process.pid, startedAt: 'now' }));
    await expect(buildTree(root, { provider: null })).rejects.toThrow(/another overstory build/u);
  });

  it('reclaims a stale lock owned by a dead process', async () => {
    mkdirSync(join(root, '.overstory'), { recursive: true });
    // 4000001 is not a multiple of 4 — never a real Windows PID; comfortably dead on POSIX too.
    writeFileSync(join(root, '.overstory', 'build.lock'), JSON.stringify({ pid: 4000001, startedAt: 'past' }));
    const { rebuiltLeaves, checkpointFailures } = await buildTree(root, { provider: null });
    expect(rebuiltLeaves).toBe(3);
    expect(checkpointFailures).toBe(0);
    expect(existsSync(join(root, '.overstory', 'build.lock'))).toBe(false); // released
  });

  it('persists corpusOptions into the tree and reuses them for verification', async () => {
    await buildTree(root, { provider: null, include: ['src/**'] });
    const stored = JSON.parse(readFileSync(treePath(root), 'utf8'));
    expect(stored.corpusOptions).toEqual({ include: ['src/**'] });
    // verifyExisting must scope to the stored include: README.md (outside the corpus)
    // must not appear, and nothing verifies OUT_OF_CORPUS spuriously.
    unlinkSync(join(root, 'README.md')); // would look like a corpus change if mis-scoped
    const result = await verifyExisting(root);
    expect(result).not.toBeNull();
    expect(result!.verification.freshness).toBe(1);
    expect(result!.staleFiles).toEqual([]);
  });
});
