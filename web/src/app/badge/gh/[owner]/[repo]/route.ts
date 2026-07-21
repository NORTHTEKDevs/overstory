import { fetchGithubSnapshot, reverify } from '../../../../../lib/engine.js';
import { badgeSvg } from '../../../../../lib/pages.js';
import { getStoredTree, recordReverify } from '../../../../../lib/store.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const svg = (body: string, cache: string): Response =>
  new Response(body, { headers: { 'content-type': 'image/svg+xml', 'cache-control': cache } });

/** README badge: recomputed from the actual gate against the live repo (cached at the CDN).
 * Unindexed repos get a neutral badge, never a fake number. */
export const GET = async (_req: Request, ctx: { params: Promise<{ owner: string; repo: string }> }): Promise<Response> => {
  const params = await ctx.params;
  const owner = params.owner;
  const repo = params.repo.replace(/\.svg$/u, '');
  if (!/^[\w.-]+$/u.test(owner) || !/^[\w.-]+$/u.test(repo)) return svg(badgeSvg(null), 'no-store');

  try {
    const stored = await getStoredTree(owner, repo);
    if (!stored) return svg(badgeSvg(null), 'public, s-maxage=3600');
    const snapshot = await fetchGithubSnapshot(owner, repo).catch(() => null);
    if (!snapshot) return svg(badgeSvg(Math.round(stored.lastFreshness * 100)), 'public, s-maxage=3600');
    const result = reverify(stored.tree, snapshot);
    await recordReverify(owner, repo, result.freshness);
    return svg(badgeSvg(Math.round(result.freshness * 100)), 'public, s-maxage=21600, stale-while-revalidate=86400');
  } catch {
    return svg(badgeSvg(null), 'public, s-maxage=600');
  }
};
