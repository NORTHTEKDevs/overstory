import { describe, expect, it } from 'vitest';
import { chunkFile } from '../src/core/chunk.js';

const codeLines = (n: number, prefix = 'const x'): string =>
  Array.from({ length: n }, (_, i) => `${prefix}${i} = ${i};`).join('\n');

describe('chunkFile', () => {
  it('returns a single chunk for a small file', () => {
    const text = codeLines(50);
    const chunks = chunkFile('src/a.ts', text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(50);
  });

  it('splits markdown by top-level headings', () => {
    const md = ['# Intro', 'text one', '', '## Usage', 'text two', '', '## API', 'text three'].join('\n');
    const chunks = chunkFile('README.md', md);
    expect(chunks.length).toBe(3);
    expect(chunks[0].text).toContain('# Intro');
    expect(chunks[1].text).toContain('## Usage');
    expect(chunks[2].text).toContain('## API');
  });

  it('splits large code files at top-level declaration boundaries', () => {
    const block = (name: string) =>
      [`export function ${name}() {`, ...Array.from({ length: 120 }, (_, i) => `  work(${i});`), '}'].join('\n');
    const text = [block('alpha'), block('beta'), block('gamma'), block('delta'), block('epsilon')].join('\n');
    const chunks = chunkFile('src/big.ts', text);
    expect(chunks.length).toBeGreaterThan(1);
    // every chunk starts at a declaration line, not mid-block
    for (const c of chunks) {
      expect(c.text.split('\n')[0]).toMatch(/^export function /);
    }
  });

  it('covers the whole file exactly: chunks are contiguous, 1-based, inclusive', () => {
    const block = (name: string) =>
      [`export function ${name}() {`, ...Array.from({ length: 120 }, (_, i) => `  work(${i});`), '}'].join('\n');
    const text = [block('a'), block('b'), block('c'), block('d')].join('\n');
    const chunks = chunkFile('src/big.ts', text);
    expect(chunks[0].startLine).toBe(1);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startLine).toBe(chunks[i - 1].endLine + 1);
    }
    const totalLines = text.split('\n').length;
    expect(chunks[chunks.length - 1].endLine).toBe(totalLines);
  });

  it('falls back to fixed windows for large files without recognizable structure', () => {
    const text = Array.from({ length: 900 }, (_, i) => `data ${i}`).join('\n');
    const chunks = chunkFile('notes/dump.txt', text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[chunks.length - 1].endLine).toBe(900);
  });

  it('reconstructs original normalized text from chunk spans', () => {
    const md = ['# One', 'alpha', '## Two', 'beta'].join('\n');
    const chunks = chunkFile('doc.md', md);
    const rebuilt = chunks.map((c) => c.text).join('\n');
    expect(rebuilt).toBe(md);
  });
});
