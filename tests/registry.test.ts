import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { fetchGithubSnapshot, readTar, snapshotFromTarball } from '../src/registry/github.js';
import { adjudicatePublish, instantTree, reverify } from '../src/registry/registry.js';

/** Minimal ustar writer for fixtures (mirror of the reader's subset + checksums). */
const tarEntry = (name: string, content: Buffer, type = '0'): Buffer => {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(content.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(' ', 148, 156); // checksum placeholder
  header.write(type, 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const b of header) sum += b;
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  const padded = Math.ceil(content.length / 512) * 512;
  const body = Buffer.alloc(padded);
  content.copy(body);
  return Buffer.concat([header, body]);
};

const makeTarball = (files: Record<string, string | Buffer>, rootDir = 'demo-abc1234'): Buffer => {
  const parts: Buffer[] = [
    tarEntry('pax_global_header', Buffer.from('52 comment=1234\n'), 'g'), // GitHub always includes this
  ];
  for (const [name, content] of Object.entries(files)) {
    parts.push(tarEntry(`${rootDir}/${name}`, Buffer.isBuffer(content) ? content : Buffer.from(content)));
  }
  parts.push(Buffer.alloc(1024)); // end-of-archive
  return gzipSync(Buffer.concat(parts));
};

const FILES = {
  'README.md': '# Demo\nA registry test repo.\n',
  'src/math.ts': 'export function add(a: number, b: number) {\n  return a + b;\n}\n',
  'node_modules/x/index.js': 'ignored',
  'package-lock.json': '{}',
  'logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]),
};

describe('github tarball reader', () => {
  it('parses entries, skips pax_global_header, strips the root dir, recovers the sha', () => {
    const snap = snapshotFromTarball(makeTarball(FILES), 'HEAD');
    expect(snap.sha).toBe('abc1234');
    const files = [...snap.corpus.files.keys()];
    expect(files).toContain('README.md');
    expect(files).toContain('src/math.ts');
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
    expect(files).not.toContain('package-lock.json');
    expect(files).not.toContain('logo.png');
    expect(snap.corpus.skipped.some((s) => s.file === 'logo.png' && s.reason === 'binary')).toBe(true);
  });

  it('readTar round-trips content exactly', () => {
    const entries = readTar(Buffer.concat([tarEntry('demo-x/a.txt', Buffer.from('hello\nworld')), Buffer.alloc(1024)]));
    expect(entries).toHaveLength(1);
    expect(entries[0].data.toString('utf8')).toBe('hello\nworld');
  });

  it('rejects hostile owner/repo/ref strings before any network call', async () => {
    await expect(fetchGithubSnapshot('bad owner', 'x')).rejects.toThrow(/invalid/u);
    await expect(fetchGithubSnapshot('ok', 'x', { ref: '../../etc' })).rejects.toThrow(/invalid/u);
  });

  it('rejects traversal and over-long segments in owner/repo', async () => {
    const unreachable = (async () => {
      throw new Error('network was reached — validation did not run first');
    }) as unknown as typeof fetch;
    for (const [owner, repo] of [['..', 'r'], ['o', '..'], ['.', 'r'], ['o', 'a'.repeat(101)]]) {
      await expect(fetchGithubSnapshot(owner, repo, { fetchImpl: unreachable })).rejects.toThrow(/invalid/u);
    }
  });

  it('refuses a gzip bomb: passes the compressed cap, dies on the uncompressed one', async () => {
    // 60MB of zeros compresses to ~60KB — comfortably under any sane compressed-size cap.
    const bomb = gzipSync(Buffer.alloc(60_000_000));
    expect(bomb.length).toBeLessThan(1_000_000);
    const fetchImpl = (async () => new Response(bomb, { status: 200 })) as typeof fetch;
    await expect(
      fetchGithubSnapshot('o', 'r', { fetchImpl, maxUncompressedBytes: 1_000_000 }),
    ).rejects.toThrow(/uncompressed cap/u);
  });

  it('aborts an oversized transfer mid-stream instead of buffering it whole', async () => {
    let delivered = 0;
    const chunk = new Uint8Array(64_000);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        delivered += chunk.byteLength;
        if (delivered > 4_000_000) return controller.close();
        controller.enqueue(chunk);
      },
    });
    const fetchImpl = (async () => new Response(body, { status: 200 })) as typeof fetch;
    await expect(fetchGithubSnapshot('o', 'r', { fetchImpl, maxTarballBytes: 500_000 })).rejects.toThrow(
      /too large/u,
    );
    // Cancelled early: nowhere near the full 4MB was pulled through.
    expect(delivered).toBeLessThan(2_000_000);
  });

  it('fetch uses codeload and enforces the size cap (mocked)', async () => {
    const tarball = makeTarball(FILES);
    const fetchImpl = (async (url: RequestInfo | URL) => {
      expect(String(url)).toBe('https://codeload.github.com/o/r/tar.gz/HEAD');
      return new Response(tarball, { status: 200 });
    }) as typeof fetch;
    const snap = await fetchGithubSnapshot('o', 'r', { fetchImpl });
    expect(snap.sha).toBe('abc1234');
    await expect(fetchGithubSnapshot('o', 'r', { fetchImpl, maxTarballBytes: 10 })).rejects.toThrow(/too large/u);
  });
});

describe('registry adjudication', () => {
  it('instantTree: extractive, deterministic, 100% verified', async () => {
    const snap = snapshotFromTarball(makeTarball(FILES), 'HEAD');
    const { tree, verification } = await instantTree(snap, 'demo');
    expect(verification.freshness).toBe(1);
    expect(tree.nodes['leaf:src/math.ts']).toBeDefined();
    expect(tree.builtAt).toBeTruthy();
  });

  it('publish accepts a tree whose every receipt verifies against the fetched snapshot', async () => {
    const snap = snapshotFromTarball(makeTarball(FILES), 'HEAD');
    const { tree } = await instantTree(snap, 'demo');
    const { verdict, tree: accepted } = adjudicatePublish(JSON.parse(JSON.stringify(tree)), snap);
    expect(verdict.accepted).toBe(true);
    expect(verdict.freshness).toBe(1);
    expect(accepted).not.toBeNull();
  });

  it('publish REJECTS a tampered tree and names the failing receipts (never hosts partial truth)', async () => {
    const snap = snapshotFromTarball(makeTarball(FILES), 'HEAD');
    const { tree } = await instantTree(snap, 'demo');
    const raw = JSON.parse(JSON.stringify(tree));
    const leaf = raw.nodes['leaf:src/math.ts'];
    leaf.claims[0].citations[0].span.text = 'export function evil() {}'; // forged receipt
    leaf.claims[0].citations[0].span.contentHash = 'not-the-hash';
    const { verdict, tree: accepted } = adjudicatePublish(raw, snap);
    expect(verdict.accepted).toBe(false);
    expect(accepted).toBeNull();
    expect(verdict.failures.length).toBeGreaterThan(0);
    expect(verdict.failures[0].claimId).toContain('src/math.ts');
  });

  it('publish rejects a tree built against DIFFERENT code (claims about another repo)', async () => {
    const snapA = snapshotFromTarball(makeTarball(FILES), 'HEAD');
    const other = snapshotFromTarball(makeTarball({ 'main.py': 'print("hello")\n' }, 'other-def5678'), 'HEAD');
    const { tree } = await instantTree(other, 'other');
    const { verdict } = adjudicatePublish(JSON.parse(JSON.stringify(tree)), snapA);
    expect(verdict.accepted).toBe(false);
  });

  it('publish rejects schema garbage without crashing', () => {
    const snap = snapshotFromTarball(makeTarball(FILES), 'HEAD');
    const { verdict } = adjudicatePublish({ not: 'a tree' }, snap);
    expect(verdict.accepted).toBe(false);
    expect(verdict.failures[0].verdict).toBe('INVALID');
  });

  it('reverify reports honest decay when the repo moves on', async () => {
    const snap = snapshotFromTarball(makeTarball(FILES), 'HEAD');
    const { tree } = await instantTree(snap, 'demo');
    const moved = snapshotFromTarball(
      makeTarball({ ...FILES, 'src/math.ts': 'export function addAll(xs: number[]) {\n  return xs.reduce((a, b) => a + b, 0);\n}\n' }),
      'HEAD',
    );
    const result = reverify(tree, moved);
    expect(result.freshness).toBeLessThan(1);
    expect(result.verified).toBeLessThan(result.claims);
  });
});
