import { describe, expect, it } from 'vitest';
import { parseGithubRemote, publishTree } from '../src/registry/publishClient.js';
import type { Tree } from '../src/core/types.js';

describe('parseGithubRemote', () => {
  it('handles https, ssh, and .git forms', () => {
    expect(parseGithubRemote('https://github.com/NORTHTEKDevs/overstory.git')).toEqual({ owner: 'NORTHTEKDevs', repo: 'overstory' });
    expect(parseGithubRemote('git@github.com:NORTHTEKDevs/overstory.git')).toEqual({ owner: 'NORTHTEKDevs', repo: 'overstory' });
    expect(parseGithubRemote('https://github.com/a/b')).toEqual({ owner: 'a', repo: 'b' });
    expect(parseGithubRemote('https://github.com/a/b/')).toEqual({ owner: 'a', repo: 'b' });
    expect(parseGithubRemote('https://gitlab.com/a/b')).toBeNull();
  });
});

describe('publishTree', () => {
  const fakeTree = { version: 1 } as unknown as Tree;

  it('posts to /api/publish and returns the verdict', async () => {
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://reg.example/api/publish');
      const body = JSON.parse(String(init?.body));
      expect(body.owner).toBe('o');
      return new Response(JSON.stringify({ verdict: { accepted: true, freshness: 1, claims: 3, verified: 3, failures: [] }, url: 'https://reg.example/gh/o/r' }), { status: 200 });
    }) as typeof fetch;
    const res = await publishTree('https://reg.example/', 'o', 'r', 'HEAD', fakeTree, fetchImpl);
    expect(res.verdict.accepted).toBe(true);
    expect(res.url).toContain('/gh/o/r');
  });

  it('surfaces rejection verdicts without throwing', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ verdict: { accepted: false, freshness: 0.9, claims: 10, verified: 9, failures: [{ claimId: 'x', text: 'y', verdict: 'STALE' }] } }), { status: 400 })) as typeof fetch;
    const res = await publishTree('https://reg.example', 'o', 'r', 'HEAD', fakeTree, fetchImpl);
    expect(res.verdict.accepted).toBe(false);
    expect(res.verdict.failures[0].verdict).toBe('STALE');
  });

  it('throws a clear error on non-verdict failures', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 })) as typeof fetch;
    await expect(publishTree('https://reg.example', 'o', 'r', 'HEAD', fakeTree, fetchImpl)).rejects.toThrow('rate limited');
  });
});
