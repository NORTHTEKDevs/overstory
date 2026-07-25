import { gunzipSync } from 'node:zlib';
import { normalizeText, sha256, splitLines } from '../core/hash.js';
import type { LoadedCorpus, SkippedFile } from '../core/corpus.js';

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor', 'coverage',
  '.next', '.nuxt', '.overstory', '.cache', '__pycache__', '.venv', 'venv',
  '.idea', '.vscode', '.turbo', '.pytest_cache',
]);
const EXCLUDED_FILENAMES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'Cargo.lock',
  'poetry.lock', 'uv.lock', 'Gemfile.lock', 'composer.lock', 'go.sum',
]);
const BINARY_EXTENSIONS =
  /\.(png|jpe?g|gif|webp|ico|icns|pdf|zip|gz|tgz|bz2|7z|rar|exe|dll|so|dylib|wasm|pyd|class|jar|woff2?|ttf|otf|eot|mp[34]|mov|avi|sqlite|db|bin|pack|idx|lock)$/iu;

export interface GithubSnapshot {
  corpus: LoadedCorpus;
  /** Commit sha, recovered from the tarball's root directory name. */
  sha: string;
  ref: string;
}

export interface FetchOptions {
  ref?: string; // default 'HEAD' (default branch)
  maxTarballBytes?: number;
  /** Ceiling on the DECOMPRESSED tarball. A compressed-size cap alone does not bound
   * memory: gzip ratios above 1000:1 are trivial to construct, so a repo well under the
   * compressed cap can still expand to gigabytes. */
  maxUncompressedBytes?: number;
  maxFiles?: number;
  maxFileBytes?: number;
  fetchImpl?: typeof fetch;
}

const octal = (buf: Buffer): number => {
  const s = buf.toString('ascii').replace(/\0/gu, '').trim();
  return s.length === 0 ? 0 : parseInt(s, 8);
};

interface TarEntry {
  name: string;
  type: string;
  data: Buffer;
}

/** Minimal ustar reader — enough for GitHub codeload tarballs. Handles pax extended
 * headers ('x' path overrides) and skips the pax_global_header ('g'). */
export const readTar = (tar: Buffer): TarEntry[] => {
  const entries: TarEntry[] = [];
  let offset = 0;
  let paxPath: string | null = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break; // end-of-archive blocks
    const rawName = header.subarray(0, 100).toString('utf8').replace(/\0.*$/u, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/u, '');
    const size = octal(header.subarray(124, 136));
    const type = header.subarray(156, 157).toString('ascii') || '0';
    const dataStart = offset + 512;
    const data = tar.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;

    if (type === 'x' || type === 'X') {
      // pax extended header: records "len key=value\n"; capture a path override.
      const text = data.toString('utf8');
      const match = /(?:^|\n)\d+ path=([^\n]+)\n/u.exec(text);
      paxPath = match ? match[1] : null;
      continue;
    }
    if (type === 'g') continue; // pax_global_header
    const name = paxPath ?? (prefix ? `${prefix}/${rawName}` : rawName);
    paxPath = null;
    if (type === '0' || type === '') entries.push({ name, type, data: Buffer.from(data) });
  }
  return entries;
};

const looksBinary = (buf: Buffer): boolean => buf.subarray(0, 8000).includes(0);

/** Decompress with a hard output ceiling so a gzip bomb fails fast and loudly instead of
 * exhausting the function's memory. */
export const gunzipUnderCap = (tarball: Buffer, maxOutputLength: number): Buffer => {
  try {
    return gunzipSync(tarball, { maxOutputLength });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    const message = err instanceof Error ? err.message : String(err);
    if (code === 'ERR_BUFFER_TOO_LARGE' || /larger than|maxOutputLength/iu.test(message)) {
      throw new Error(
        `repo expands past the registry's ${Math.round(maxOutputLength / 1e6)}MB uncompressed cap`,
      );
    }
    throw err;
  }
};

/** Read a response body against a running byte ceiling, cancelling the transfer the moment
 * it is exceeded. Buffering the whole body and checking `.length` afterwards would let a
 * hostile repo exhaust memory before the check ever ran. */
const readUnderCap = async (res: Response, cap: number): Promise<Buffer> => {
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > cap) throw new Error(tarballTooLarge(cap));
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      throw new Error(tarballTooLarge(cap));
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
};

const tarballTooLarge = (cap: number): string =>
  `repo too large for the registry (tarball exceeds the ${Math.round(cap / 1e6)}MB cap)`;

/** GitHub owners are <=39 chars and repos <=100; neither may contain a path segment or a
 * traversal sequence. Validated before the URL is built, not after. */
const validSegment = (segment: string): boolean =>
  /^[\w.-]{1,100}$/u.test(segment) && !segment.includes('..') && segment !== '.';

/** Turn a GitHub codeload tarball into an in-memory corpus. The tarball's root directory
 * is `{repo}-{sha}/` — the sha comes free, no API call needed. */
export const snapshotFromTarball = (tarball: Buffer, ref: string, opts: FetchOptions = {}): GithubSnapshot => {
  const maxFiles = opts.maxFiles ?? 5_000;
  const maxFileBytes = opts.maxFileBytes ?? 1_000_000;
  const maxUncompressedBytes = opts.maxUncompressedBytes ?? 400_000_000;
  const entries = readTar(gunzipUnderCap(tarball, maxUncompressedBytes));
  if (entries.length === 0) throw new Error('empty tarball');

  const rootDir = entries[0].name.split('/')[0];
  const shaMatch = /-([0-9a-f]{7,40})$/u.exec(rootDir);
  const sha = shaMatch ? shaMatch[1] : rootDir;

  const files = new Map<string, { hash: string; lines: string[] }>();
  const skipped: SkippedFile[] = [];
  const sorted = entries
    .map((e) => ({ ...e, rel: e.name.split('/').slice(1).join('/') }))
    .filter((e) => e.rel.length > 0)
    .sort((a, b) => a.rel.localeCompare(b.rel));

  for (const entry of sorted) {
    const rel = entry.rel;
    if (rel.split('/').some((part) => EXCLUDED_DIRS.has(part))) continue;
    if (EXCLUDED_FILENAMES.has(rel.split('/').pop() ?? '')) continue;
    if (files.size >= maxFiles) {
      skipped.push({ file: rel, reason: 'file-cap' });
      continue;
    }
    if (BINARY_EXTENSIONS.test(rel) || looksBinary(entry.data)) {
      skipped.push({ file: rel, reason: 'binary' });
      continue;
    }
    if (entry.data.length > maxFileBytes) {
      skipped.push({ file: rel, reason: 'too-large' });
      continue;
    }
    const norm = normalizeText(entry.data.toString('utf8'));
    files.set(rel, { hash: sha256(norm), lines: splitLines(norm) });
  }

  return { corpus: { root: `github:${ref}`, files, skipped }, sha, ref };
};

/** Fetch a public GitHub repo snapshot via codeload — no git, no API token, one request. */
export const fetchGithubSnapshot = async (
  owner: string,
  repo: string,
  opts: FetchOptions = {},
): Promise<GithubSnapshot> => {
  if (!validSegment(owner) || !validSegment(repo)) throw new Error('invalid owner/repo');
  const ref = opts.ref ?? 'HEAD';
  if (!/^[\w][\w./-]*$/u.test(ref) || ref.includes('..')) throw new Error('invalid ref');
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxTarballBytes = opts.maxTarballBytes ?? 40_000_000;

  const res = await fetchImpl(`https://codeload.github.com/${owner}/${repo}/tar.gz/${ref}`, {
    signal: AbortSignal.timeout(60_000),
    headers: { 'user-agent': 'overstory-registry' },
  });
  if (res.status === 404) throw new Error(`GitHub repo not found (or private): ${owner}/${repo}@${ref}`);
  if (!res.ok) throw new Error(`GitHub tarball fetch failed: HTTP ${res.status}`);
  const buf = await readUnderCap(res, maxTarballBytes);
  return snapshotFromTarball(buf, ref, opts);
};
