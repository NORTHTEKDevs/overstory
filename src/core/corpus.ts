import { execFile } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { normalizeText, sha256, splitLines } from './hash.js';
import type { CorpusSnapshot } from './types.js';

const execFileP = promisify(execFile);

/** Never source, at any depth. Tool caches and dependency trees only. */
const ALWAYS_EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '.overstory', '.next', '.nuxt', '.cache',
  '__pycache__', '.venv', 'venv', '.idea', '.vscode', '.turbo', '.pytest_cache',
]);

/** Conventional build-output directory names. These are excluded ONLY at the repository
 * root, because the same words are ordinary source directories further down: `src/build/`
 * holds this project's own builder, Java puts sources under paths containing `target`, and
 * plenty of codebases have a `lib/vendor/`. Matching them at any depth silently deletes real
 * code from the tree — and a knowledge tree that quietly omits a directory is worse than one
 * that admits it does not know. Gitignored build output is already excluded by the git
 * listing, so this set is only a fallback for non-repo roots. */
const ROOT_ONLY_EXCLUDED_DIRS = new Set(['dist', 'build', 'out', 'target', 'vendor', 'coverage']);

/** Is this path segment excluded, given how deep it sits? */
const isExcludedDir = (name: string, depth: number): boolean =>
  ALWAYS_EXCLUDED_DIRS.has(name) || (depth === 0 && ROOT_ONLY_EXCLUDED_DIRS.has(name));

/** A path is excluded when any of its directory segments is. */
const hasExcludedSegment = (relPath: string): boolean => {
  const parts = relPath.split('/');
  return parts.slice(0, -1).some((part, depth) => isExcludedDir(part, depth));
};

/** Machine-generated files that add noise, not knowledge. */
const EXCLUDED_FILENAMES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'Cargo.lock',
  'poetry.lock', 'uv.lock', 'Gemfile.lock', 'composer.lock', 'go.sum',
]);

const BINARY_EXTENSIONS =
  /\.(png|jpe?g|gif|webp|ico|icns|pdf|zip|gz|tgz|bz2|7z|rar|exe|dll|so|dylib|wasm|pyd|class|jar|woff2?|ttf|otf|eot|mp[34]|mov|avi|sqlite|db|bin|pack|idx|lock)$/iu;

export interface LoadOptions {
  /** Minimal glob filters over posix-relative paths (`*`, `**`, `?`). */
  include?: string[];
  maxFileBytes?: number;
  maxFiles?: number;
  /** Use `git ls-files` for gitignore-aware listing when the root is a repo. Default true;
   * always falls back to the walker if git is unavailable or errors. */
  useGit?: boolean;
}

export interface SkippedFile {
  file: string;
  reason: 'binary' | 'too-large' | 'unreadable' | 'file-cap';
}

export interface LoadedCorpus extends CorpusSnapshot {
  skipped: SkippedFile[];
}

const globToRegex = (glob: string): RegExp => {
  const part = (p: string): string =>
    p
      .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
      .replace(/\*/gu, '[^/]*')
      .replace(/\?/gu, '.');
  const source = glob.split('**').map(part).join('.*');
  return new RegExp(`^${source}$`, 'u');
};

const listViaGit = async (root: string): Promise<string[] | null> => {
  try {
    const { stdout } = await execFileP('git', ['ls-files', '-co', '--exclude-standard'], {
      cwd: root,
      timeout: 10_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    const files = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    return files.length > 0 ? files : null;
  } catch {
    return null;
  }
};

const walk = async (root: string, rel = ''): Promise<string[]> => {
  const abs = rel === '' ? root : join(root, rel);
  const entries = await readdir(abs, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (isExcludedDir(entry.name, rel === '' ? 0 : rel.split('/').length)) continue;
      files.push(...(await walk(root, childRel)));
    } else if (entry.isFile()) {
      files.push(childRel);
    }
  }
  return files;
};

const looksBinary = (buf: Buffer): boolean => {
  const probe = buf.subarray(0, 8000);
  return probe.includes(0);
};

/** Load a corpus snapshot: gitignore-aware when possible, default excludes always,
 * binaries and oversized files skipped with reasons, content normalized, order
 * deterministic. */
export const loadCorpus = async (root: string, opts: LoadOptions = {}): Promise<LoadedCorpus> => {
  // Number.isFinite (not ??): NaN from a mis-parsed flag must fall back to the safe
  // default, never silently disable a cap.
  const maxFileBytes = Number.isFinite(opts.maxFileBytes) ? (opts.maxFileBytes as number) : 1_000_000;
  const maxFiles = Number.isFinite(opts.maxFiles) ? (opts.maxFiles as number) : 5_000;
  const includeRes = opts.include?.map(globToRegex);

  let candidates = (opts.useGit ?? true) ? await listViaGit(root) : null;
  if (!candidates) candidates = await walk(root);
  candidates = candidates
    .map((f) => f.replace(/\\/gu, '/'))
    .filter((f) => !hasExcludedSegment(f))
    .filter((f) => !EXCLUDED_FILENAMES.has(f.split('/').pop() ?? ''))
    .sort();

  const files = new Map<string, { hash: string; lines: string[] }>();
  const skipped: SkippedFile[] = [];

  for (const rel of candidates) {
    if (includeRes && !includeRes.some((re) => re.test(rel))) continue;
    if (files.size >= maxFiles) {
      skipped.push({ file: rel, reason: 'file-cap' });
      continue;
    }
    if (BINARY_EXTENSIONS.test(rel)) {
      skipped.push({ file: rel, reason: 'binary' });
      continue;
    }
    try {
      const info = await stat(join(root, rel));
      if (info.size > maxFileBytes) {
        skipped.push({ file: rel, reason: 'too-large' });
        continue;
      }
      const buf = await readFile(join(root, rel));
      if (looksBinary(buf)) {
        skipped.push({ file: rel, reason: 'binary' });
        continue;
      }
      const norm = normalizeText(buf.toString('utf8'));
      files.set(rel, { hash: sha256(norm), lines: splitLines(norm) });
    } catch {
      skipped.push({ file: rel, reason: 'unreadable' });
    }
  }

  return { root, files, skipped };
};
