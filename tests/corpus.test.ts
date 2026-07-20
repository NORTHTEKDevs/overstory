import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCorpus } from '../src/core/corpus.js';

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'overstory-corpus-'));
  mkdirSync(join(root, 'src', 'deep'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
  mkdirSync(join(root, '.git'), { recursive: true });
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# Test project\nHello.\n');
  writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
  writeFileSync(join(root, 'src', 'deep', 'b.ts'), 'export const b = 2;\r\n');
  writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'ignored');
  writeFileSync(join(root, '.git', 'HEAD'), 'ignored');
  writeFileSync(join(root, 'dist', 'out.js'), 'ignored');
  writeFileSync(join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x00]));
  writeFileSync(join(root, 'huge.txt'), 'x'.repeat(2 * 1024 * 1024));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('loadCorpus', () => {
  it('walks recursively, excludes default dirs, binaries, and oversized files', async () => {
    const corpus = await loadCorpus(root);
    const files = [...corpus.files.keys()];
    expect(files).toContain('README.md');
    expect(files).toContain('src/a.ts');
    expect(files).toContain('src/deep/b.ts');
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
    expect(files.some((f) => f.startsWith('.git'))).toBe(false);
    expect(files.some((f) => f.startsWith('dist'))).toBe(false);
    expect(files).not.toContain('logo.png');
    expect(files).not.toContain('huge.txt');
  });

  it('reports skipped files honestly', async () => {
    const { skipped } = await loadCorpus(root);
    const reasons = Object.fromEntries(skipped.map((s) => [s.file, s.reason]));
    expect(reasons['logo.png']).toBe('binary');
    expect(reasons['huge.txt']).toBe('too-large');
  });

  it('returns deterministic sorted order and normalized content', async () => {
    const one = await loadCorpus(root);
    const two = await loadCorpus(root);
    expect([...one.files.keys()]).toEqual([...two.files.keys()]);
    // CRLF file normalized identically to LF
    expect(one.files.get('src/deep/b.ts')!.lines).toEqual(['export const b = 2;']);
  });

  it('respects include filter when provided', async () => {
    const corpus = await loadCorpus(root, { include: ['src/**'] });
    const files = [...corpus.files.keys()];
    expect(files).toEqual(['src/a.ts', 'src/deep/b.ts']);
  });
});
