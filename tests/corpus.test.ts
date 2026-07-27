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

describe('build-output exclusions are anchored to the root', () => {
  let deep: string;

  beforeAll(async () => {
    deep = mkdtempSync(join(tmpdir(), 'overstory-dirs-'));
    // Root-level build output: genuinely generated, must be skipped.
    mkdirSync(join(deep, 'dist'), { recursive: true });
    writeFileSync(join(deep, 'dist', 'bundle.js'), 'export const generated = 1;\n');
    mkdirSync(join(deep, 'build'), { recursive: true });
    writeFileSync(join(deep, 'build', 'out.js'), 'export const alsoGenerated = 1;\n');
    // The same words nested under src/ are ordinary source directories. This project keeps
    // its own builder in src/build/, and excluding by bare name at any depth silently
    // deleted it from the tree.
    mkdirSync(join(deep, 'src', 'build'), { recursive: true });
    writeFileSync(join(deep, 'src', 'build', 'builder.ts'), 'export const realSource = 1;\n');
    mkdirSync(join(deep, 'lib', 'vendor'), { recursive: true });
    writeFileSync(join(deep, 'lib', 'vendor', 'shim.ts'), 'export const vendored = 1;\n');
    // Dependency and VCS trees are never source, at any depth.
    mkdirSync(join(deep, 'src', 'node_modules'), { recursive: true });
    writeFileSync(join(deep, 'src', 'node_modules', 'dep.js'), 'module.exports = 1;\n');
  });

  afterAll(() => rmSync(deep, { recursive: true, force: true }));

  it('keeps nested source directories that share a build-output name', async () => {
    const { files } = await loadCorpus(deep, { useGit: false });
    const paths = [...files.keys()];
    expect(paths).toContain('src/build/builder.ts');
    expect(paths).toContain('lib/vendor/shim.ts');
  });

  it('still skips root build output and dependency trees at any depth', async () => {
    const { files } = await loadCorpus(deep, { useGit: false });
    const paths = [...files.keys()];
    expect(paths).not.toContain('dist/bundle.js');
    expect(paths).not.toContain('build/out.js');
    expect(paths).not.toContain('src/node_modules/dep.js');
  });
});
