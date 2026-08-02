import { describe, expect, it } from 'vitest';
import { detectDrift, driftInFile, parseDiff } from '../src/drift/detect.js';

describe('parseDiff', () => {
  it('reads new-side line ranges from hunk headers', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -18,0 +19,2 @@ import x',
      '@@ -30,1 +33 @@ Usage:',
      '',
    ].join('\n');
    expect(parseDiff(diff)).toEqual([
      { file: 'src/a.ts', ranges: [{ start: 19, end: 20 }, { start: 33, end: 33 }] },
    ]);
  });

  it('skips deleted files — a comment removed with its code has not drifted', () => {
    const diff = ['--- a/gone.ts', '+++ b/dev/null', '@@ -1,5 +0,0 @@'].join('\n');
    expect(parseDiff(diff)).toEqual([]);
  });

  it('ignores pure-deletion hunks, which add no new lines to inspect', () => {
    const diff = ['+++ b/a.ts', '@@ -5,3 +4,0 @@'].join('\n');
    expect(parseDiff(diff)).toEqual([]);
  });

  it('handles several files in one diff', () => {
    const diff = ['+++ b/a.ts', '@@ -1 +1 @@', '+++ b/b.ts', '@@ -9,0 +10,3 @@'].join('\n');
    const out = parseDiff(diff);
    expect(out.map((f) => f.file)).toEqual(['a.ts', 'b.ts']);
    expect(out[1].ranges).toEqual([{ start: 10, end: 12 }]);
  });
});

/** A documented function at a known layout:
 *  1: /** Adds two numbers. *␘/
 *  2: export const add = (a, b) => a + b;
 */
const FILE = ['/** Adds two numbers and returns the sum. */', 'export const add = (a, b) => a + b;', ''].join('\n');

describe('driftInFile', () => {
  it('flags a declaration that changed while its comment did not', () => {
    const found = driftInFile('m.ts', FILE, [{ start: 2, end: 2 }]);
    expect(found).toHaveLength(1);
    expect(found[0].symbol).toBe('add(a, b)');
    expect(found[0].line).toBe(2);
    expect(found[0].comment).toBe('Adds two numbers and returns the sum.');
  });

  it('stays silent when the comment changed too', () => {
    // The load-bearing counterpart to the test above: without this, the detector could be
    // flagging every edit and the first test would still pass.
    expect(driftInFile('m.ts', FILE, [{ start: 1, end: 2 }])).toEqual([]);
  });

  it('stays silent when only the comment changed', () => {
    expect(driftInFile('m.ts', FILE, [{ start: 1, end: 1 }])).toEqual([]);
  });

  it('stays silent when neither changed', () => {
    expect(driftInFile('m.ts', FILE, [{ start: 50, end: 60 }])).toEqual([]);
  });

  it('ignores undocumented declarations entirely', () => {
    const bare = ['export const add = (a, b) => a + b;', ''].join('\n');
    expect(driftInFile('m.ts', bare, [{ start: 1, end: 1 }])).toEqual([]);
  });

  it('does not flag a body change by default', () => {
    const withBody = [
      '/** Adds two numbers and returns the sum. */',
      'export function add(a, b) {',
      '  return a - b;',
      '}',
      '',
    ].join('\n');
    // Line 3 is the body. The default is signature-only, deliberately: flagging every body
    // edit makes the bot noisy enough to be muted, which costs more than the misses.
    expect(driftInFile('m.ts', withBody, [{ start: 3, end: 3 }])).toEqual([]);
  });

  it('flags a body change when --include-body is asked for', () => {
    const withBody = [
      '/** Adds two numbers and returns the sum. */',
      'export function add(a, b) {',
      '  return a - b;',
      '}',
      '',
    ].join('\n');
    const found = driftInFile('m.ts', withBody, [{ start: 3, end: 3 }], { includeBody: true });
    expect(found).toHaveLength(1);
    expect(found[0].symbol).toBe('add(a, b)');
  });

  it('reports the comment line range so a reviewer can jump straight to it', () => {
    const multi = [
      '/**',
      ' * Adds two numbers and returns the sum.',
      ' */',
      'export const add = (a, b) => a + b;',
      '',
    ].join('\n');
    const found = driftInFile('m.ts', multi, [{ start: 4, end: 4 }]);
    expect(found[0].commentStartLine).toBe(1);
    expect(found[0].commentEndLine).toBe(3);
  });
});

describe('detectDrift', () => {
  const diff = ['+++ b/m.ts', '@@ -2 +2 @@'].join('\n');

  it('reads the file at the named head rather than from disk', async () => {
    const calls: string[][] = [];
    const report = await detectDrift('/repo', {
      base: 'main',
      head: 'abc123',
      runGit: async (args) => {
        calls.push(args);
        return args[0] === 'diff' ? diff : FILE;
      },
    });
    expect(report.available).toBe(true);
    expect(report.findings).toHaveLength(1);
    // Content must come from the ref under review, not the working tree, or CI and local
    // runs disagree whenever the tree is dirty.
    expect(calls.some((c) => c[0] === 'show' && c[1] === 'abc123:m.ts')).toBe(true);
  });

  it('reports unavailable instead of throwing outside a repository', async () => {
    const report = await detectDrift('/repo', {
      runGit: async () => { throw new Error('fatal: not a git repository'); },
    });
    expect(report.available).toBe(false);
    expect(report.reason).toMatch(/not a git repository/u);
  });

  it('skips files whose extension is not source', async () => {
    const report = await detectDrift('/repo', {
      base: 'main',
      head: 'abc',
      runGit: async (args) => (args[0] === 'diff' ? ['+++ b/notes.md', '@@ -1 +1 @@'].join('\n') : FILE),
    });
    expect(report.filesChanged).toBe(0);
    expect(report.findings).toEqual([]);
  });
});
