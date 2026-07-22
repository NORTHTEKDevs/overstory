import { fetchGithubSnapshot, fetchRepoTree, reverify } from '../../../../../lib/engine.js';
import { badgeSvg } from '../../../../../lib/pages.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const svg = (body: string, cache: string): Response =>
  new Response(body, { headers: { 'content-type': 'image/svg+xml', 'cache-control': cache } });

/** README badge, computed live from the repo's OWN committed tree against its OWN code.
 * Nothing stored, nothing trusted: unpublished repos get a neutral badge, never a number. */
export const GET = async (_req: Request, ctx: { params: Promise<{ owner: string; repo: string }> }): Promise<Response> => {
  const params = await ctx.params;
  const owner = params.owner;
  const repo = params.repo.replace(/\.svg$/u, '');
  if (!/^[\w.-]+$/u.test(owner) || !/^[\w.-]+$/u.test(repo)) return svg(badgeSvg(null), 'no-store');

  try {
    const published = await fetchRepoTree(owner, repo);
    if (!published) return svg(badgeSvg(null), 'public, s-maxage=3600');
    const snapshot = await fetchGithubSnapshot(owner, repo);
    const result = reverify(published.tree, snapshot);
    return svg(badgeSvg(Math.round(result.freshness * 100)), 'public, s-maxage=21600, stale-while-revalidate=86400');
  } catch {
    return svg(badgeSvg(null), 'public, s-maxage=600');
  }
};
