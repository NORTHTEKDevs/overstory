import { describe, expect, it } from 'vitest';
import { parseGitLog, readHistory } from '../src/git/history.js';
import { documentationRisk, hotspots, knowledgeConcentration } from '../src/git/risk.js';
import type { Tree, TreeVerification } from '../src/core/types.js';

const NUL = String.fromCharCode(0);
const DAY = 86_400;
const NOW = 1_800_000_000_000; // fixed clock: these assertions must not drift with the date
const secondsAgo = (days: number): number => Math.floor(NOW / 1000 - days * DAY);

/** Build `git log --name-only --format=%x00%at|%aN` output. */
const gitLog = (commits: Array<{ at: number; author: string; files: string[] }>): string =>
  commits.map((c) => `${NUL}${c.at}|${c.author}\n${c.files.join('\n')}\n`).join('');

const runGit = (out: string) => async () => out;

const treeWith = (leaves: Record<string, string[]>): Tree =>
  ({
    version: 1,
    name: 't',
    root: 'root',
    nodes: Object.fromEntries(
      Object.entries(leaves).map(([file, claimIds]) => [
        `leaf:${file}`,
        { id: `leaf:${file}`, kind: 'leaf', path: file, title: file, children: [], builtAt: '', claims: claimIds.map((id) => ({ id, text: id, citations: [] })) },
      ]),
    ),
    corpusFiles: {},
    builtAt: '',
    generator: 'test',
  }) as unknown as Tree;

const verificationWith = (verdicts: Record<string, string>): TreeVerification =>
  ({ freshness: 1, verdicts: new Map(Object.entries(verdicts)) }) as unknown as TreeVerification;

describe('parseGitLog', () => {
  it('reads commits, authors and touched files', () => {
    const commits = parseGitLog(gitLog([
      { at: secondsAgo(1), author: 'Ada', files: ['a.ts', 'b.ts'] },
      { at: secondsAgo(2), author: 'Grace', files: ['a.ts'] },
    ]));
    expect(commits).toHaveLength(2);
    expect(commits[0].author).toBe('Ada');
    expect(commits[0].files).toEqual(['a.ts', 'b.ts']);
  });

  it('survives filenames containing spaces and backslashes', () => {
    const commits = parseGitLog(gitLog([{ at: secondsAgo(1), author: 'Ada', files: ['src\\win path\\a b.ts'] }]));
    expect(commits[0].files).toEqual(['src/win path/a b.ts']);
  });

  it('ignores malformed blocks rather than throwing', () => {
    expect(parseGitLog('')).toEqual([]);
    expect(parseGitLog(`${NUL}not-a-timestamp|Ada\nfile.ts\n`)).toEqual([]);
  });
});

describe('readHistory', () => {
  const out = gitLog([
    { at: secondsAgo(1), author: 'Ada', files: ['hot.ts', 'hot.test.ts'] },
    { at: secondsAgo(2), author: 'Ada', files: ['hot.ts', 'hot.test.ts'] },
    { at: secondsAgo(3), author: 'Ada', files: ['hot.ts', 'hot.test.ts'] },
    { at: secondsAgo(4), author: 'Grace', files: ['hot.ts'] },
    { at: secondsAgo(900), author: 'Ada', files: ['cold.ts'] },
  ]);

  it('counts commits and distinct authors per file', async () => {
    const h = await readHistory('/x', { runGit: runGit(out), now: NOW });
    expect(h.available).toBe(true);
    expect(h.commitsRead).toBe(5);
    expect(h.files.get('hot.ts')?.commits).toBe(4);
    expect(h.files.get('hot.ts')?.authors.sort()).toEqual(['Ada', 'Grace']);
    expect(h.files.get('hot.ts')?.ownershipConcentration).toBeCloseTo(0.75, 2);
  });

  it('weights recent churn above old churn', async () => {
    const h = await readHistory('/x', { runGit: runGit(out), now: NOW });
    const hot = h.files.get('hot.ts')!;
    const cold = h.files.get('cold.ts')!;
    // cold.ts is a single commit from ~2.5 years ago; its weight must be far below one.
    expect(cold.weightedChurn).toBeLessThan(0.05);
    expect(hot.weightedChurn).toBeGreaterThan(cold.weightedChurn * 50);
  });

  it('finds files that change together', async () => {
    const h = await readHistory('/x', { runGit: runGit(out), now: NOW });
    const pair = h.coupling.find((c) => c.file === 'hot.test.ts' && c.partner === 'hot.ts');
    expect(pair?.together).toBe(3);
    expect(pair?.ratio).toBe(1); // every commit touching the test also touched the source
  });

  it('ignores sweeping commits when computing coupling', async () => {
    const sweep = gitLog([
      { at: secondsAgo(1), author: 'Ada', files: Array.from({ length: 80 }, (_, i) => `f${i}.ts`) },
      { at: secondsAgo(2), author: 'Ada', files: Array.from({ length: 80 }, (_, i) => `f${i}.ts`) },
      { at: secondsAgo(3), author: 'Ada', files: Array.from({ length: 80 }, (_, i) => `f${i}.ts`) },
    ]);
    const h = await readHistory('/x', { runGit: runGit(sweep), now: NOW });
    expect(h.files.size).toBe(80); // the files are still counted
    expect(h.coupling).toEqual([]); // but a formatting sweep implies no real relationship
  });

  it('reports unavailable instead of throwing outside a repository', async () => {
    const h = await readHistory('/x', {
      runGit: async () => { throw new Error('fatal: not a git repository'); },
    });
    expect(h.available).toBe(false);
    expect(h.reason).toMatch(/not a git repository/u);
    expect(h.files.size).toBe(0);
  });
});

describe('documentation risk', () => {
  const history = async (extra: Array<{ at: number; author: string; files: string[] }> = []) =>
    readHistory('/x', {
      now: NOW,
      runGit: runGit(gitLog([
        { at: secondsAgo(1), author: 'Ada', files: ['busy.ts'] },
        { at: secondsAgo(2), author: 'Ada', files: ['busy.ts'] },
        { at: secondsAgo(3), author: 'Ada', files: ['busy.ts'] },
        { at: secondsAgo(4), author: 'Ada', files: ['busy.ts', 'undocumented.ts'] },
        { at: secondsAgo(5), author: 'Ada', files: ['quiet.ts'] },
        ...extra,
      ])),
    });

  it('flags a busy file whose claims no longer verify', async () => {
    const tree = treeWith({ 'busy.ts': ['c1', 'c2'], 'quiet.ts': ['c3'] });
    const rows = documentationRisk(tree, verificationWith({ c1: 'STALE', c2: 'VERIFIED', c3: 'VERIFIED' }), await history(), { now: NOW });
    const busy = rows.find((r) => r.file === 'busy.ts');
    expect(busy).toBeTruthy();
    expect(busy?.staleClaims).toBe(1);
    expect(busy?.reasons.join(' ')).toMatch(/no longer verify/u);
  });

  it('does NOT flag a file whose docs all verify, however busy it is', async () => {
    const tree = treeWith({ 'busy.ts': ['c1', 'c2'] });
    const rows = documentationRisk(tree, verificationWith({ c1: 'VERIFIED', c2: 'VERIFIED' }), await history(), { now: NOW });
    // Being edited a lot is not a defect. Without this the list is just "most-edited files".
    expect(rows.find((r) => r.file === 'busy.ts')).toBeUndefined();
  });

  it('flags an undocumented file that is being worked on', async () => {
    const tree = treeWith({ 'busy.ts': ['c1'], 'undocumented.ts': [] });
    const rows = documentationRisk(tree, verificationWith({ c1: 'VERIFIED' }), await history(), { now: NOW });
    const row = rows.find((r) => r.file === 'undocumented.ts');
    expect(row?.reasons).toContain('no documented symbols');
  });

  it('ranks stale documentation above merely undocumented', async () => {
    const tree = treeWith({ 'busy.ts': ['c1'], 'undocumented.ts': [] });
    const rows = documentationRisk(tree, verificationWith({ c1: 'STALE' }), await history(), { now: NOW });
    expect(rows[0].file).toBe('busy.ts');
  });

  it('stays silent about ownership in a repository with too few authors', async () => {
    const tree = treeWith({ 'busy.ts': ['c1'] });
    const rows = documentationRisk(tree, verificationWith({ c1: 'STALE' }), await history(), { now: NOW });
    // Ada wrote everything, so "100% by Ada" is a fact about the team, not about the file.
    expect(rows[0].reasons.join(' ')).not.toMatch(/% of changes by/u);
  });
});

describe('hotspots and ownership', () => {
  const out = gitLog([
    { at: secondsAgo(1), author: 'Ada', files: ['live.ts', 'deleted.ts'] },
    { at: secondsAgo(2), author: 'Ada', files: ['live.ts', 'deleted.ts'] },
    { at: secondsAgo(3), author: 'Ada', files: ['deleted.ts'] },
  ]);

  it('excludes files that no longer exist', async () => {
    const h = await readHistory('/x', { runGit: runGit(out), now: NOW });
    const all = hotspots(h, 10).map((f) => f.file);
    expect(all).toContain('deleted.ts');
    const live = hotspots(h, 10, new Set(['live.ts'])).map((f) => f.file);
    expect(live).toEqual(['live.ts']);
  });

  it('returns no ownership findings for a one- or two-person repository', async () => {
    const h = await readHistory('/x', { runGit: runGit(out), now: NOW });
    expect(knowledgeConcentration(h, 10)).toEqual([]);
  });

  it('reports concentration once a team is large enough for it to mean something', async () => {
    const team = gitLog([
      ...Array.from({ length: 6 }, (_, i) => ({ at: secondsAgo(i + 1), author: 'Ada', files: ['owned.ts'] })),
      { at: secondsAgo(10), author: 'Grace', files: ['shared.ts'] },
      { at: secondsAgo(11), author: 'Linus', files: ['shared.ts'] },
    ]);
    const h = await readHistory('/x', { runGit: runGit(team), now: NOW });
    const found = knowledgeConcentration(h, 10);
    expect(found.map((f) => f.file)).toContain('owned.ts');
    expect(found[0].topAuthor).toBe('Ada');
  });
});
