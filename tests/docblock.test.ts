import { describe, expect, it } from 'vitest';
import { DECL_RE, firstSentence, followingDoc, precedingDoc, signatureOf } from '../src/build/docblock.js';
import { extractiveClaims } from '../src/build/summarize.js';
import { makeSpan, verifyTree } from '../src/core/gate.js';
import { sha256, normalizeText, splitLines } from '../src/core/hash.js';
import type { Claim, CorpusSnapshot, Tree } from '../src/core/types.js';

const corpusOf = (file: string, source: string): CorpusSnapshot => {
  const norm = normalizeText(source);
  return {
    root: '/test',
    files: new Map([[file, { hash: sha256(norm), lines: splitLines(norm) }]]),
    skipped: [],
  };
};

describe('precedingDoc', () => {
  it('finds a JSDoc block above a declaration', () => {
    const lines = ['/** Adds two numbers together. */', 'export const add = (a, b) => a + b;'];
    expect(precedingDoc(lines, 1)?.text).toBe('Adds two numbers together.');
    expect(precedingDoc(lines, 1)?.startIndex).toBe(0);
  });

  it('joins a multi-line block and drops @tag lines', () => {
    const lines = ['/**', ' * Reads the config file.', ' * @param path where to read from', ' */', 'function read(path) {}'];
    const doc = precedingDoc(lines, 4);
    expect(doc?.text).toBe('Reads the config file.');
    expect(doc?.text).not.toContain('@param');
  });

  it('walks a run of line comments, in several comment syntaxes', () => {
    for (const marker of ['//', '///', '#', '--']) {
      const lines = [`${marker} Computes the checksum`, `${marker} of the payload.`, 'def checksum(p):'];
      expect(precedingDoc(lines, 2)?.text).toBe('Computes the checksum of the payload.');
    }
  });

  it('steps over decorators and attributes between comment and declaration', () => {
    const lines = ['/** Handles the request. */', '@Injectable()', 'export class Handler {}'];
    expect(precedingDoc(lines, 2)?.text).toBe('Handles the request.');
  });

  it('refuses to attach noise: short markers, separators, and distant comments', () => {
    expect(precedingDoc(['// TODO', 'const x = 1;'], 1)).toBeNull();
    expect(precedingDoc(['/** ok */', 'const x = 1;'], 1)).toBeNull();
    expect(precedingDoc(['/** Real description here. */', '', 'const x = 1;'], 2)).toBeNull();
    expect(precedingDoc(['const y = 2;', 'const x = 1;'], 1)).toBeNull();
  });
});

describe('signatureOf', () => {
  it('names the symbol and its parameters, dropping types', () => {
    expect(signatureOf('export const gunzip = (buf: Buffer, max: number): Buffer => {')).toBe('gunzip(buf, max)');
    expect(signatureOf('export function read(path: string, opts?: Opts) {')).toBe('read(path, opts)');
    expect(signatureOf('def checksum(payload, algo="sha256"):')).toBe('checksum(payload, algo)');
    expect(signatureOf('pub fn parse(input: &str) -> Result<T> {')).toBe('parse(input)');
  });

  it('returns the bare name for non-callable declarations', () => {
    expect(signatureOf('export interface Bm25Doc {')).toBe('Bm25Doc');
    expect(signatureOf('const K1 = 1.2;')).toBe('K1');
  });

  it('returns null when there is no identifier to name', () => {
    expect(signatureOf('export {')).toBe(null);
    expect(signatureOf('   ')).toBe(null);
  });
});

describe('firstSentence', () => {
  it('takes one sentence and truncates on a word boundary', () => {
    expect(firstSentence('Does a thing. Then another thing.')).toBe('Does a thing.');
    const long = firstSentence(`${'word '.repeat(80)}end.`, 40);
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('extractive claims from doc comments', () => {
  const source = [
    'const INTERNAL = 1;',
    '',
    '/** Decompresses under a hard ceiling so a bomb fails fast. */',
    'export const gunzipUnderCap = (tarball, maxOutputLength) => {',
    '  return null;',
    '};',
  ].join('\n');

  it("uses the author's own comment as the claim, citing comment and declaration together", () => {
    const corpus = corpusOf('a.ts', source);
    const span = makeSpan('a.ts', 1, 6, corpus);
    const claims = extractiveClaims('a.ts', span, corpus);
    const documented = claims.find((c) => c.text.includes('gunzipUnderCap'));
    expect(documented?.text).toBe(
      '`gunzipUnderCap(tarball, maxOutputLength)`: Decompresses under a hard ceiling so a bomb fails fast.',
    );
    // The receipt must cover the comment AND the signature — that pairing is the evidence,
    // and it is what makes comment rot detectable.
    const cited = documented?.citations[0];
    expect(cited?.kind).toBe('span');
    if (cited?.kind !== 'span') throw new Error('expected a span citation');
    expect(cited.span.startLine).toBe(3);
    expect(cited.span.endLine).toBe(4);
    expect(cited.span.text).toContain('Decompresses under a hard ceiling');
    expect(cited.span.text).toContain('gunzipUnderCap');
  });

  it('goes STALE when the code changes but the comment does not', () => {
    const corpus = corpusOf('a.ts', source);
    const span = makeSpan('a.ts', 1, 6, corpus);
    const claims = extractiveClaims('a.ts', span, corpus).map((c, i) => ({ ...c, id: `c${i}` }) as Claim);
    const tree: Tree = {
      version: 1,
      name: 't',
      root: 'r',
      nodes: { r: { id: 'r', kind: 'leaf', title: 'a.ts', path: 'a.ts', children: [], claims, builtAt: '' } },
      corpusFiles: {},
      builtAt: '',
      generator: 'test',
    } as unknown as Tree;

    expect(verifyTree(tree, corpus).freshness).toBe(1);

    // Rename a parameter and leave the comment untouched: exactly the drift this exists for.
    const drifted = corpusOf('a.ts', source.replace('maxOutputLength', 'cap'));
    const after = verifyTree(tree, drifted);
    expect(after.freshness).toBeLessThan(1);
    const verdicts = [...after.verdicts.values()];
    expect(verdicts.some((v) => v === 'STALE' || (typeof v === 'object' && v.verdict === 'STALE'))).toBe(true);
  });

  it('prefers documented and exported symbols over private declarations when capped', () => {
    const noisy = [
      ...Array.from({ length: 10 }, (_, i) => `const PRIVATE_${i} = ${i};`),
      '/** The one thing worth knowing about this file. */',
      'export const theImportantOne = () => {};',
    ].join('\n');
    const corpus = corpusOf('b.ts', noisy);
    const span = makeSpan('b.ts', 1, 12, corpus);
    const claims = extractiveClaims('b.ts', span, corpus);
    expect(claims.length).toBeLessThanOrEqual(8);
    expect(claims.some((c) => c.text.includes('theImportantOne'))).toBe(true);
  });
});

describe('language coverage', () => {
  // Each case is a documented symbol in a language OVERSTORY claims to support. A regression
  // here means an entire ecosystem silently reads as undocumented.
  const cases: Array<[string, string, string]> = [
    ['go', 'func Add(a int, b int) int {', 'Add(a int, b int)'],
    ['kotlin', 'fun add(a: Int, b: Int): Int {', 'add(a, b)'],
    ['swift', 'func add(a: Int, b: Int) -> Int {', 'add(a, b)'],
    ['rust', 'pub fn add(a: i32, b: i32) -> i32 {', 'add(a, b)'],
    ['python', 'def add(a, b):', 'add(a, b)'],
    ['ruby', 'def add(a, b)', 'add(a, b)'],
    ['typescript', 'export const add = (a: number, b: number) => a + b;', 'add(a, b)'],
  ];

  it.each(cases)('recognises a %s declaration', (_lang, line, _sig) => {
    expect(DECL_RE.test(line)).toBe(true);
  });

  it('names the function, not its return type, in C-family declarations', () => {
    // The bug this guards: `public int add(...)` reported the symbol as "int".
    expect(signatureOf('public int add(int a, int b) {')).toBe('add(int a, int b)');
    expect(signatureOf('int add(int a, int b) {')).toBe('add(int a, int b)');
    expect(signatureOf('public static void main(String[] args) {')).toBe('main(String[] args)');
    expect(signatureOf('unsigned long count(void) {')).toBe('count(void)');
  });

  it('does not mistake control flow or calls for declarations', () => {
    for (const line of ['if (x) {', 'while (ready) {', 'for (const a of b) {', 'switch (v) {', 'return add(a, b);', '  doThing(arg);']) {
      expect(DECL_RE.test(line)).toBe(false);
    }
  });
});

describe('followingDoc', () => {
  it('reads a single-line Python docstring', () => {
    const lines = ['def add(a, b):', '    """Adds two numbers and returns the sum."""', '    return a + b'];
    expect(followingDoc(lines, 0)?.text).toBe('Adds two numbers and returns the sum.');
  });

  it('reads a multi-line docstring and reports where it ends', () => {
    const lines = ['def add(a, b):', '    """', '    Adds two numbers', '    and returns the sum.', '    """', '    return a + b'];
    const doc = followingDoc(lines, 0);
    expect(doc?.text).toBe('Adds two numbers and returns the sum.');
    expect(doc?.startIndex).toBe(1);
    expect(doc?.endIndex).toBe(4);
  });

  it('refuses an unterminated docstring rather than swallowing the file', () => {
    const lines = ['def add(a, b):', '    """never closed', ...Array.from({ length: 80 }, () => '    x')];
    expect(followingDoc(lines, 0)).toBeNull();
  });

  it('returns nothing when the body is code, not a description', () => {
    expect(followingDoc(['def add(a, b):', '    return a + b'], 0)).toBeNull();
  });
});
