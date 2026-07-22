import { z } from 'zod';
import { fetchGithubSnapshot, fetchRepoTree, reverify } from '../../../lib/engine.js';
import { rateLimit } from '../../../lib/limits.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({
  owner: z.string().regex(/^[\w.-]+$/u),
  repo: z.string().regex(/^[\w.-]+$/u),
});

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

/** Stateless publish-check: is there a tree committed in the repo, and does every receipt
 * verify against the code right now? Nothing is stored — this is a verification service,
 * not a datastore. `overstory publish` calls this after you commit your tree. */
export const POST = async (req: Request): Promise<Response> => {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  if (!rateLimit(`check:${ip}`, 30)) return json({ error: 'rate limited — try again shortly' }, 429);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return json({ error: 'invalid body: expected {owner, repo}' }, 400);
  }

  try {
    const snapshot = await fetchGithubSnapshot(body.owner, body.repo);
    const published = await fetchRepoTree(body.owner, body.repo);
    const origin = new URL(req.url).origin;
    if (!published) {
      return json({
        published: false,
        hint: 'commit your tree as .overstory/tree.json (or attach overstory-tree.json to your latest release), push, then check again',
      }, 404);
    }
    const result = reverify(published.tree, snapshot);
    return json({
      published: true,
      source: published.source,
      sha: snapshot.sha,
      freshness: result.freshness,
      verified: result.verified,
      claims: result.claims,
      url: `${origin}/gh/${body.owner}/${body.repo}`,
      badge: `[![overstory](${origin}/badge/gh/${body.owner}/${body.repo}.svg)](${origin}/gh/${body.owner}/${body.repo})`,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
};
