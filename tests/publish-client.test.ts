import { describe, expect, it } from 'vitest';
import { checkPublished, parseGithubRemote } from '../src/registry/publishClient.js';
import { fetchRepoTree } from '../src/registry/repoTree.js';

describe('parseGithubRemote', () => {
  it('handles https, ssh, and .git forms', () => {
    expect(parseGithubRemote('https://github.com/NORTHTEKDevs/overstory.git')).toEqual({ owner: 'NORTHTEKDevs', repo: 'overstory' });
    expect(parseGithubRemote('git@github.com:NORTHTEKDevs/overstory.git')).toEqual({ owner: 'NORTHTEKDevs', repo: 'overstory' });
    expect(parseGithubRemote('https://github.com/a/b')).toEqual({ owner: 'a', repo: 'b' });
    expect(parseGithubRemote('https://github.com/a/b/')).toEqual({ owner: 'a', repo: 'b' });
    expect(parseGithubRemote('https://gitlab.com/a/b')).toBeNull();
  });
});

describe('checkPublished (zero-storage: the registry only verifies, never stores)', () => {
  it('returns the verification report for a published repo', async () => {
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://reg.example/api/check');
      expect(JSON.parse(String(init?.body)).owner).toBe('o');
      return new Response(JSON.stringify({ published: true, source: '.overstory/tree.json', freshness: 1, verified: 10, claims: 10, url: 'https://reg.example/gh/o/r' }), { status: 200 });
    }) as typeof fetch;
    const res = await checkPublished('https://reg.example/', 'o', 'r', fetchImpl);
    expect(res.published).toBe(true);
    expect(res.freshness).toBe(1);
  });

  it('returns not-published (with hint) without throwing on 404', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ published: false, hint: 'commit your tree' }), { status: 404 })) as typeof fetch;
    const res = await checkPublished('https://reg.example', 'o', 'r', fetchImpl);
    expect(res.published).toBe(false);
    expect(res.hint).toContain('commit');
  });

  it('throws clearly on real errors', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 })) as typeof fetch;
    await expect(checkPublished('https://reg.example', 'o', 'r', fetchImpl)).rejects.toThrow('rate limited');
  });
});

describe('fetchRepoTree (the repo IS the database)', () => {
  const validTree = JSON.stringify({
    version: 1, name: 'demo', root: 'root',
    nodes: { root: { id: 'root', kind: 'root', path: '', title: 'demo', summary: '', claims: [], childIds: [], builtWith: 'extractive', builtAt: '' } },
    corpusFiles: {}, builtAt: '', generator: 't',
  });

  it('finds a committed .overstory/tree.json first', async () => {
    const fetchImpl = (async (url: RequestInfo | URL) => {
      if (String(url).includes('raw.githubusercontent')) return new Response(validTree, { status: 200 });
      throw new Error('should not reach release fallback');
    }) as typeof fetch;
    const res = await fetchRepoTree('o', 'r', 'HEAD', fetchImpl);
    expect(res?.source).toBe('.overstory/tree.json');
    expect(res?.tree.name).toBe('demo');
  });

  it('falls back to the latest release asset', async () => {
    const fetchImpl = (async (url: RequestInfo | URL) =>
      String(url).includes('raw.githubusercontent') ? new Response('nope', { status: 404 }) : new Response(validTree, { status: 200 })) as typeof fetch;
    const res = await fetchRepoTree('o', 'r', 'HEAD', fetchImpl);
    expect(res?.source).toBe('release asset');
  });

  it('treats invalid or schema-garbage trees as absent — never rendered', async () => {
    const garbage = (async () => new Response('{"not":"a tree"}', { status: 200 })) as typeof fetch;
    expect(await fetchRepoTree('o', 'r', 'HEAD', garbage)).toBeNull();
    const broken = (async () => new Response('not json', { status: 200 })) as typeof fetch;
    expect(await fetchRepoTree('o', 'r', 'HEAD', broken)).toBeNull();
  });
});
