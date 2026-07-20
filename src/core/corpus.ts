import { execFile } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { normalizeText, sha256, splitLines } from './hash.js';
import type { CorpusSnapshot } from './types.js';

const execFileP = promisify(execFile);

const DEFAULT_EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor', 'coverage',
  '.next', '.nuxt', '.overstory', '.cache', '__pycache__', '.venv', 'venv',
  '.idea', '.vscode', '.turbo', '.pytest_cache',
]);

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
      if (DEFAULT_EXCLUDED_DIRS.has(entry.name)) continue;
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
  const maxFileBytes = opts.maxFileBytes ?? 1_000_000;
  const maxFiles = opts.maxFiles ?? 5_000;
  const includeRes = opts.include?.map(globToRegex);

  let candidates = (opts.useGit ?? true) ? await listViaGit(root) : null;
  if (!candidates) candidates = await walk(root);
  candidates = candidates
    .map((f) => f.replace(/\\/gu, '/'))
    .filter((f) => !f.split('/').some((part) => DEFAULT_EXCLUDED_DIRS.has(part)))
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
