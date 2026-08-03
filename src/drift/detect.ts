import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DECL_RE, followingDoc, precedingDoc, signatureOf } from '../build/docblock.js';

const execFileP = promisify(execFile);

/** A contiguous run of changed lines in a file's NEW content, 1-based and inclusive. */
export interface ChangedRange {
  start: number;
  end: number;
}

export interface FileDiff {
  file: string;
  ranges: ChangedRange[];
}

export interface DriftFinding {
  file: string;
  /** Line of the declaration whose code moved. */
  line: number;
  symbol: string;
  /** The declaration as it read before this change, when it could be recovered. Turns
   * "something moved" into "this is what moved", which is what a reviewer needs. */
  was?: string;
  /** The comment that did not move with it. */
  comment: string;
  commentStartLine: number;
  commentEndLine: number;
}

export interface DriftOptions {
  /** What to compare against. Omit to inspect uncommitted work. */
  base?: string;
  head?: string;
  /** Also treat changes below the declaration line as drift. Off by default: it fires on
   * ordinary refactors, and a review bot people mute is worth nothing. */
  includeBody?: boolean;
  runGit?: (args: string[], cwd: string) => Promise<string>;
}

const defaultRunGit = async (args: string[], cwd: string): Promise<string> => {
  const { stdout } = await execFileP('git', args, { cwd, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return stdout;
};

/** The new side of a working-tree diff is simply the file on disk. */
const readWorkingFile = (root: string, file: string): Promise<string> => readFile(join(root, file), 'utf8');

const TEXT_LIKE = /\.(m?[jt]sx?|py|rb|go|rs|java|kt|swift|c|h|cc|cpp|hpp|cs|php|scala|sh|lua|pl|r|ex|exs|dart)$/iu;

/**
 * Parse `git diff -U0` into per-file changed line ranges.
 *
 * Only the NEW side matters: a comment that vanished with its code is not drift, it is a
 * deletion. Hunk headers look like `@@ -18,0 +19,2 @@`, where the `+` pair is the range in
 * the file as it now stands. A missing count means exactly one line.
 */
export const parseDiff = (raw: string): FileDiff[] => {
  const files: FileDiff[] = [];
  let current: FileDiff | null = null;
  for (const line of raw.split('\n')) {
    const newFile = /^\+\+\+ b\/(.+)$/u.exec(line);
    if (newFile) {
      // /dev/null means the file was deleted; there is nothing left to have drifted.
      current = newFile[1] === 'dev/null' ? null : { file: newFile[1].replace(/\\/gu, '/'), ranges: [] };
      if (current) files.push(current);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/u.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      // A pure deletion reports +N,0 — no new lines exist, so nothing changed to inspect.
      if (count > 0) current.ranges.push({ start, end: start + count - 1 });
    }
  }
  return files.filter((f) => f.ranges.length > 0);
};

const intersects = (ranges: ChangedRange[], start: number, end: number): boolean =>
  ranges.some((r) => r.start <= end && r.end >= start);

/** Compare code for meaning, not for bytes. Reformatting is not drift: if a formatter
 * reflows a signature, the diff marks the line as changed but nothing about the contract
 * moved, and flagging it would light up every declaration in a Prettier commit.
 *
 * Whitespace is removed entirely rather than collapsed, because collapsing still leaves
 * `(): string` and `() : string` different while meaning the same thing. Identifiers cannot
 * contain spaces, so for an equality test this is safe. */
const normalizeCode = (text: string): string => text.replace(/\s+/gu, '');

/** Prose needs the softer rule: words matter, line wrapping does not. */
const normalizeProse = (text: string): string => text.replace(/\s+/gu, ' ').trim();

/** Index the previous version of a file by symbol, so a flagged declaration can be compared
 * against what it actually replaced rather than against a line number. Keyed by symbol
 * because line numbers shift for reasons that have nothing to do with the symbol. */
interface PriorSymbol {
  decl: string;
  comment: string | null;
}
export const indexSymbols = (content: string): Map<string, PriorSymbol> => {
  const lines = content.split('\n').map((l) => l.replace(/\r$/u, ''));
  const out = new Map<string, PriorSymbol>();
  for (let i = 0; i < lines.length; i++) {
    if (!DECL_RE.test(lines[i])) continue;
    const symbol = signatureOf(lines[i]);
    if (!symbol) continue;
    const name = symbol.replace(/\(.*$/u, ''); // key on the name; params are what may change
    const doc = precedingDoc(lines, i) ?? followingDoc(lines, i);
    if (!out.has(name)) out.set(name, { decl: lines[i], comment: doc ? doc.text : null });
  }
  return out;
};

/**
 * Find documented symbols whose code changed while their comment did not.
 *
 * `content` is the file as it now stands. Line numbers are 1-based to match every tool a
 * developer will cross-reference this against.
 */
export const driftInFile = (
  file: string,
  content: string,
  ranges: ChangedRange[],
  opts: { includeBody?: boolean; previous?: string } = {},
): DriftFinding[] => {
  const lines = content.split('\n').map((l) => l.replace(/\r$/u, ''));
  const prior = opts.previous === undefined ? null : indexSymbols(opts.previous);
  const findings: DriftFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!DECL_RE.test(lines[i])) continue;
    const symbol = signatureOf(lines[i]);
    if (!symbol) continue;

    // A description may sit above the declaration or, in Python and friends, inside it.
    const above = precedingDoc(lines, i);
    const below = above ? null : followingDoc(lines, i);
    const doc = above ?? below;
    if (!doc) continue;

    const declLine = i + 1;
    const commentStart = doc.startIndex + 1;
    const commentEnd = above ? i : (below as { endIndex: number }).endIndex + 1;

    // How far below the declaration counts as "its code". Signature-only by default.
    let codeEnd = declLine;
    if (opts.includeBody) {
      let j = i + 1;
      while (j < lines.length && !DECL_RE.test(lines[j])) j++;
      codeEnd = j; // up to the next declaration
    }

    // The diff says where to look. It does not say whether anything meaningful happened.
    if (!intersects(ranges, declLine, codeEnd) && !intersects(ranges, commentStart, commentEnd)) continue;

    let codeChanged = intersects(ranges, declLine, codeEnd);
    let commentChanged = intersects(ranges, commentStart, commentEnd);
    let was: string | undefined;

    if (prior) {
      const previous = prior.get(symbol.replace(/\(.*$/u, ''));
      // A symbol with no previous version is new; its comment is new too, so nothing drifted.
      if (!previous) continue;
      // Compare against what this actually replaced. Whitespace-only edits are not drift,
      // and a reflowed comment is not an updated comment.
      codeChanged = normalizeCode(previous.decl) !== normalizeCode(lines[i]);
      commentChanged = normalizeProse(previous.comment ?? '') !== normalizeProse(doc.text);
      if (codeChanged) was = previous.decl.trim();
      // With the body in scope, a body edit still counts even if the signature held.
      if (opts.includeBody && !codeChanged) codeChanged = intersects(ranges, declLine + 1, codeEnd);
    }

    if (codeChanged && !commentChanged) {
      findings.push({
        file,
        line: declLine,
        symbol,
        was,
        comment: doc.text,
        commentStartLine: commentStart,
        commentEndLine: commentEnd,
      });
    }
  }
  return findings;
};

/** Files changed relative to a base ref (or in the working tree when base is omitted).
 * Used to scope repo-wide checks to a pull request's actual footprint: a review bot that
 * reports pre-existing findings on an unrelated PR is a bot that gets uninstalled. */
export const changedFiles = async (
  root: string,
  opts: { base?: string; head?: string; runGit?: (args: string[], cwd: string) => Promise<string> } = {},
): Promise<string[] | null> => {
  const runGit = opts.runGit ?? defaultRunGit;
  const args = ['diff', '--name-only', '--find-renames', '--no-color'];
  if (opts.base && opts.head) args.push(`${opts.base}...${opts.head}`);
  else if (opts.base) args.push(opts.base);
  try {
    const raw = await runGit(args, root);
    return raw
      .split('\n')
      .map((l) => l.trim().replace(/\\/gu, '/'))
      .filter((l) => l.length > 0);
  } catch {
    return null; // not a repository: caller decides whether to fall back to a full scan
  }
};

export interface DriftReport {
  available: boolean;
  reason?: string;
  /** What was compared, for the report header. */
  comparison: string;
  filesChanged: number;
  findings: DriftFinding[];
}

/**
 * Detect documentation drift across a diff.
 *
 * Deliberately needs no knowledge tree, no build and no configuration: the whole point is that
 * a team can run this on a pull request the day they hear about it.
 */
export const detectDrift = async (root: string, opts: DriftOptions = {}): Promise<DriftReport> => {
  const runGit = opts.runGit ?? defaultRunGit;
  const head = opts.head;
  const args = ['diff', '-U0', '--find-renames', '--no-color'];
  if (opts.base && head) args.push(`${opts.base}...${head}`);
  else if (opts.base) args.push(opts.base);
  const comparison = opts.base ? `${opts.base}${head ? `...${head}` : ' → working tree'}` : 'uncommitted changes';

  let raw: string;
  try {
    raw = await runGit(args, root);
  } catch (err) {
    return {
      available: false,
      reason: err instanceof Error ? err.message.split('\n')[0] : 'git diff failed',
      comparison,
      filesChanged: 0,
      findings: [],
    };
  }

  const diffs = parseDiff(raw).filter((d) => TEXT_LIKE.test(d.file));
  const findings: DriftFinding[] = [];
  for (const d of diffs) {
    let content: string;
    try {
      // Read whichever side of the comparison the diff's "new" column refers to: a named head
      // means that commit, otherwise the diff was against the working tree and the file on
      // disk is the new side. Reading the wrong one reports drift that is not there.
      content = head ? await runGit(['show', `${head}:${d.file}`], root) : await readWorkingFile(root, d.file);
    } catch {
      continue; // file is gone, binary, or unreadable at that ref
    }
    // The previous version turns "this line was touched" into "this declaration actually
    // changed". Without it a formatter run reports drift on every symbol it reflows.
    let previous: string | undefined;
    try {
      previous = await runGit(['show', `${opts.base ?? 'HEAD'}:${d.file}`], root);
    } catch {
      previous = undefined; // new file, or not present on the base side
    }
    findings.push(...driftInFile(d.file, content, d.ranges, { includeBody: opts.includeBody, previous }));
  }

  return { available: true, comparison, filesChanged: diffs.length, findings };
};
