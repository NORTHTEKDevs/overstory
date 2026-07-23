import { fetchGithubSnapshot, fetchRepoTree, instantTree } from '../../../../lib/engine.js';
import { errorHtml, explorerHtml } from '../../../../lib/pages.js';
import { rateLimit } from '../../../../lib/limits.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const html = (body: string, status = 200, cache = 'public, s-maxage=600, stale-while-revalidate=3600'): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache } });

/** Fully stateless: the owner's repo is the database. If they committed a tree, render it
 * with LIVE verdicts (freshness computed here, against the code, every time the cache
 * misses). Otherwise: instant extractive tree. Nothing is ever stored. */
export const GET = async (req: Request, ctx: { params: Promise<{ owner: string; repo: string }> }): Promise<Response> => {
  const { owner, repo } = await ctx.params;
  if (!/^[\w.-]+$/u.test(owner) || !/^[\w.-]+$/u.test(repo)) {
    return html(errorHtml('Not a repository', 'That does not look like a GitHub owner/repo.'), 404, 'no-store');
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  if (!rateLimit(`view:${ip}`, 60)) {
    return html(errorHtml('Slow down', 'Too many requests from this address — try again shortly.'), 429, 'no-store');
  }

  try {
    const snapshot = await fetchGithubSnapshot(owner, repo);
    const published = await fetchRepoTree(owner, repo);
    if (published) {
      return html(
        explorerHtml(published.tree, snapshot, {
          owner,
          repo,
          sha: snapshot.sha,
          builtWith: `published by the repo (${published.source})`,
          origin: new URL(req.url).origin,
          verifiedAt: 'just now',
        }),
      );
    }
    const { tree } = await instantTree(snapshot, repo);
    return html(
      explorerHtml(tree, snapshot, {
        owner,
        repo,
        sha: snapshot.sha,
        builtWith: 'extractive (instant)',
        origin: new URL(req.url).origin,
        verifiedAt: 'just now',
      }),
      200,
      'public, s-maxage=3600, stale-while-revalidate=86400',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found')) {
      return html(
        errorHtml('Repo not found (or private)', `GitHub has no public ${owner}/${repo}.`, 'private code stays local: npx @northtek/overstory serve'),
        404,
        'no-store',
      );
    }
    return html(errorHtml('Could not build this tree', message), 502, 'no-store');
  }
};
