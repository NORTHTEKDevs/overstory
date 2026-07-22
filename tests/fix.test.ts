import { describe, expect, it } from 'vitest';
import { normalizeText, sha256, splitLines } from '../src/core/hash.js';
import { verifyTree } from '../src/core/gate.js';
import { scanFindings } from '../src/fix/scan.js';
import { findingToPrompt, findingsToMarkdown } from '../src/fix/prompts.js';
import { buildTreeFromCorpus } from '../src/build/inmemory.js';
import type { LoadedCorpus } from '../src/core/corpus.js';

const corpusOf = (files: Record<string, string>): LoadedCorpus => {
  const map = new Map<string, { hash: string; lines: string[] }>();
  for (const [file, raw] of Object.entries(files)) {
    const norm = normalizeText(raw);
    map.set(file, { hash: sha256(norm), lines: splitLines(norm) });
  }
  return { root: '/fake', files: map, skipped: [] };
};

const FIXTURE = {
  'src/auth.ts': [
    'export function login(user: string) {',
    '  // TODO: rate-limit login attempts',
    '  try {',
    '    check(user);',
    '  } catch {}',
    '  console.log("logging in", user);',
    '  return (user as any).id;',
    '}',
    'export function logout() {',
    '  return true;',
    '}',
  ].join('\n'),
  'src/util/a.ts': 'export const a = 1;\n',
  'src/util/b.ts': 'export const b = 2;\n',
  'src/util/c.ts': 'export const c = 3;\n',
  'tests/other.test.ts': 'import { a } from "../src/util/a";\n',
};

const build = async (files: Record<string, string>) => {
  const corpus = corpusOf(files);
  const { tree } = await buildTreeFromCorpus(corpus, { name: 'demo' });
  const verification = verifyTree(tree, corpus);
  return { corpus, tree, verification };
};

describe('scanFindings', () => {
  it('finds the planted issue classes with receipts', async () => {
    const { corpus, tree, verification } = await build(FIXTURE);
    const findings = scanFindings(corpus, tree, verification);
    const kinds = findings.map((f) => f.kind);
    expect(kinds).toContain('todo-comment');
    expect(kinds).toContain('empty-catch');
    expect(kinds).toContain('debug-leftover');
    expect(kinds).toContain('ts-escape-hatch');
    expect(kinds).toContain('untested-module'); // auth.ts has 2 exports, no auth test
    expect(kinds).toContain('undocumented-dir'); // src/util: 3 code files, no README
    const todo = findings.find((f) => f.kind === 'todo-comment')!;
    expect(todo.receipts[0].file).toBe('src/auth.ts');
    expect(todo.detail).toContain('rate-limit');
  });

  it('does not flag test files or documented/tested modules', async () => {
    const { corpus, tree, verification } = await build({
      'src/clean.ts': 'export const clean = () => 1;\nexport const also = () => 2;\n',
      'tests/clean.test.ts': 'import { clean } from "../src/clean";\n',
      'src/README.md': '# src\nDocs.\n',
    });
    const findings = scanFindings(corpus, tree, verification);
    expect(findings.filter((f) => f.kind === 'untested-module')).toHaveLength(0);
    expect(findings.filter((f) => f.kind === 'debug-leftover')).toHaveLength(0);
  });

  it('flags stale doc claims with the old receipt attached', async () => {
    const files = { 'README.md': '# Demo\nThe add function returns the sum.\n', 'src/math.ts': 'export const add = (a: number, b: number) => a + b;\n' };
    const { corpus, tree } = await build(files);
    // the docs change out from under the tree
    const moved = corpusOf({ ...files, 'README.md': '# Demo\nCompletely rewritten intro.\n' });
    const verification = verifyTree(tree, moved);
    const findings = scanFindings(moved, tree, verification);
    const stale = findings.find((f) => f.kind === 'stale-doc-claim');
    expect(stale).toBeDefined();
    expect(stale!.severity).toBe(1);
  });

  it('caps output and sorts fix-first severity to the top', async () => {
    const noisy: Record<string, string> = {};
    for (let i = 0; i < 40; i++) noisy[`src/f${i}.ts`] = `// TODO: thing ${i}\nexport const x${i} = ${i};\nconsole.log(${i});\n`;
    const { corpus, tree, verification } = await build(noisy);
    const findings = scanFindings(corpus, tree, verification);
    expect(findings.length).toBeLessThanOrEqual(30);
    for (let i = 1; i < findings.length; i++) expect(findings[i].severity).toBeGreaterThanOrEqual(findings[i - 1].severity);
  });
});

describe('scanner false-positive guards (live bugs from scanning ourselves)', () => {
  it('patterns inside string literals are NOT findings', async () => {
    const { corpus, tree, verification } = await build({
      'src/guide.ts': [
        "export const tip1 = 'Never leave catch {} empty';",
        'export const tip2 = "use @ts-expect-error with a reason";',
        'export const real = 1;',
      ].join('\n'),
      'tests/guide.test.ts': 'import { real } from "../src/guide";\n',
    });
    const findings = scanFindings(corpus, tree, verification);
    expect(findings.filter((f) => f.kind === 'empty-catch')).toHaveLength(0);
    expect(findings.filter((f) => f.kind === 'ts-escape-hatch')).toHaveLength(0);
  });

  it('TODO markers inside string literals are not findings; barrel files are not untested modules', async () => {
    const { corpus, tree, verification } = await build({
      'src/fixture.ts': "export const sample = '// TODO: this is example text in a string';\nexport const other = 1;\n",
      'src/index.ts': "export { sample } from './fixture.js';\nexport { other } from './fixture.js';\nexport type { T } from './t.js';\n",
      'tests/fixture.test.ts': 'import { sample } from "../src/fixture";\n',
    });
    const findings = scanFindings(corpus, tree, verification);
    expect(findings.filter((f) => f.kind === 'todo-comment')).toHaveLength(0);
    expect(findings.filter((f) => f.kind === 'untested-module' && f.title.includes('index.ts'))).toHaveLength(0);
  });

  it('types-only modules are not "untested"', async () => {
    const { corpus, tree, verification } = await build({
      'src/types.ts': 'export type A = string;\nexport interface B { a: A }\nexport type C = number;\n',
    });
    const findings = scanFindings(corpus, tree, verification);
    expect(findings.filter((f) => f.kind === 'untested-module')).toHaveLength(0);
  });
});

describe('prompt composer', () => {
  it('every prompt carries the full spec shape: goal, receipts, constraints, acceptance, steps', async () => {
    const { corpus, tree, verification } = await build(FIXTURE);
    const findings = scanFindings(corpus, tree, verification);
    for (const [i, f] of findings.entries()) {
      const p = findingToPrompt(f, i + 1);
      expect(p).toContain('**Goal**');
      expect(p).toContain('**Context (receipts');
      expect(p).toContain('**Constraints:**');
      expect(p).toContain('**Acceptance criteria (machine-checkable):**');
      expect(p).toContain('**Steps:**');
      expect(p).toContain('Smallest possible diff');
      expect(p).toContain('STOP and say so');
    }
  });

  it('markdown document leads with honest counts and grounding language', async () => {
    const { corpus, tree, verification } = await build(FIXTURE);
    const md = findingsToMarkdown(scanFindings(corpus, tree, verification), 'demo');
    expect(md).toContain('# Fix prompts for demo');
    expect(md).toContain('grounded in');
    expect(md).toContain('receipts');
    expect(md).toMatch(/\d+ findings/u);
  });
});
