import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/** Per-file facts read straight out of `git log`. Every field here is counted, never
 * inferred — the point is that a reader can re-run one git command and get the same number. */
export interface FileHistory {
  file: string;
  /** Commits touching this file within the window. */
  commits: number;
  /** Commits weighted so that recent work counts for more (see `HALF_LIFE_DAYS`). */
  weightedChurn: number;
  /** Distinct author names. */
  authors: string[];
  /** Share of this file's commits made by its most frequent author, 0..1. */
  ownershipConcentration: number;
  topAuthor: string | null;
  lastChangedAt: number | null;
  firstSeenAt: number | null;
}

export interface CoChange {
  file: string;
  partner: string;
  /** Commits containing both files. */
  together: number;
  /** together / commits touching `file` — how reliably the partner follows. */
  ratio: number;
}

export interface HistoryOptions {
  /** Commits to read, newest first. Keeps `git log` bounded on large repositories. */
  maxCommits?: number;
  /** Ignore commits touching more than this many files: releases, formatting sweeps and
   * vendored drops otherwise dominate co-change and drown the real signal. */
  maxFilesPerCommit?: number;
  /** Injected for tests. */
  runGit?: (args: string[], cwd: string) => Promise<string>;
  now?: number;
}

/** Recent churn matters more than ancient churn: a file touched twenty times last month is a
 * live problem, the same count from three years ago is history. Six months to half weight. */
const HALF_LIFE_DAYS = 180;

const defaultRunGit = async (args: string[], cwd: string): Promise<string> => {
  const { stdout } = await execFileP('git', args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
};

interface ParsedCommit {
  at: number;
  author: string;
  files: string[];
}

/** Parse `git log --format=<sep>%at|%aN --name-only` output into commits. */
export const parseGitLog = (raw: string): ParsedCommit[] => {
  const commits: ParsedCommit[] = [];
  // A record separator keeps the parser honest: filenames can contain almost anything, so
  // splitting on blank lines alone would mis-group entries.
  for (const block of raw.split('\0')) {
    const lines = block.split('\n').map((l) => l.replace(/\r$/u, ''));
    const header = lines.find((l) => l.includes('|'));
    if (!header) continue;
    const sep = header.indexOf('|');
    const at = Number(header.slice(0, sep));
    const author = header.slice(sep + 1).trim();
    if (!Number.isFinite(at) || at <= 0) continue;
    const files = lines
      .slice(lines.indexOf(header) + 1)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => l.replace(/\\/gu, '/'));
    if (files.length > 0) commits.push({ at, author, files });
  }
  return commits;
};

export interface HistoryReport {
  /** True when the root is a git repository and history could be read. */
  available: boolean;
  reason?: string;
  commitsRead: number;
  files: Map<string, FileHistory>;
  /** Strongest co-change pairs, highest ratio first. */
  coupling: CoChange[];
}

/**
 * Read per-file history for a repository.
 *
 * Returns `available: false` rather than throwing when the directory is not a repository or
 * git is missing — history is an enrichment, and its absence must never stop a build.
 */
export const readHistory = async (root: string, opts: HistoryOptions = {}): Promise<HistoryReport> => {
  const maxCommits = opts.maxCommits ?? 2000;
  const maxFilesPerCommit = opts.maxFilesPerCommit ?? 60;
  const runGit = opts.runGit ?? defaultRunGit;
  const now = opts.now ?? Date.now();

  let raw: string;
  try {
    raw = await runGit(
      ['log', `-n${maxCommits}`, '--no-merges', '--name-only', '--format=%x00%at|%aN'],
      root,
    );
  } catch (err) {
    return {
      available: false,
      reason: err instanceof Error ? err.message.split('\n')[0] : 'git log failed',
      commitsRead: 0,
      files: new Map(),
      coupling: [],
    };
  }

  const commits = parseGitLog(raw);
  const files = new Map<string, FileHistory & { authorCounts: Map<string, number> }>();
  const pairCounts = new Map<string, number>();

  for (const commit of commits) {
    const ageDays = Math.max(0, (now - commit.at * 1000) / 86_400_000);
    const weight = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    for (const file of commit.files) {
      let entry = files.get(file);
      if (!entry) {
        entry = {
          file,
          commits: 0,
          weightedChurn: 0,
          authors: [],
          ownershipConcentration: 0,
          topAuthor: null,
          lastChangedAt: null,
          firstSeenAt: null,
          authorCounts: new Map(),
        };
        files.set(file, entry);
      }
      entry.commits += 1;
      entry.weightedChurn += weight;
      entry.authorCounts.set(commit.author, (entry.authorCounts.get(commit.author) ?? 0) + 1);
      entry.lastChangedAt = Math.max(entry.lastChangedAt ?? 0, commit.at);
      entry.firstSeenAt = entry.firstSeenAt === null ? commit.at : Math.min(entry.firstSeenAt, commit.at);
    }

    // Sweeping commits say nothing about which files genuinely belong together.
    if (commit.files.length > 1 && commit.files.length <= maxFilesPerCommit) {
      const sorted = [...new Set(commit.files)].sort();
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const key = `${sorted[i]}\0${sorted[j]}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }
  }

  const finalFiles = new Map<string, FileHistory>();
  for (const [name, entry] of files) {
    const counts = [...entry.authorCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    finalFiles.set(name, {
      file: entry.file,
      commits: entry.commits,
      weightedChurn: Number(entry.weightedChurn.toFixed(3)),
      authors: counts.map(([a]) => a),
      topAuthor: counts[0]?.[0] ?? null,
      ownershipConcentration: entry.commits > 0 ? Number(((counts[0]?.[1] ?? 0) / entry.commits).toFixed(3)) : 0,
      lastChangedAt: entry.lastChangedAt,
      firstSeenAt: entry.firstSeenAt,
    });
  }

  const coupling: CoChange[] = [];
  for (const [key, together] of pairCounts) {
    if (together < 3) continue; // two files touched together twice is coincidence
    const [a, b] = key.split('\0');
    const aCommits = finalFiles.get(a)?.commits ?? 0;
    const bCommits = finalFiles.get(b)?.commits ?? 0;
    if (aCommits >= 3) coupling.push({ file: a, partner: b, together, ratio: Number((together / aCommits).toFixed(3)) });
    if (bCommits >= 3) coupling.push({ file: b, partner: a, together, ratio: Number((together / bCommits).toFixed(3)) });
  }
  coupling.sort((x, y) => y.ratio - x.ratio || y.together - x.together || x.file.localeCompare(y.file));

  return { available: true, commitsRead: commits.length, files: finalFiles, coupling };
};
