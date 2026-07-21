import { z } from 'zod';
import { adjudicatePublish, fetchGithubSnapshot } from '../../../lib/engine.js';
import { getDb } from '../../../lib/db.js';
import { rateLimit, saveTree } from '../../../lib/store.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({
  owner: z.string().regex(/^[\w.-]+$/u),
  repo: z.string().regex(/^[\w.-]+$/u),
  ref: z.string().optional(),
  tree: z.unknown(),
});

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

export const POST = async (req: Request): Promise<Response> => {
  if (!getDb()) {
    return json({ error: 'registry storage is not configured yet — instant trees work, publishing is coming online shortly' }, 503);
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  if (!rateLimit(`publish:${ip}`, 10)) return json({ error: 'rate limited — try again in an hour' }, 429);

  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await req.text();
    if (raw.length > 30_000_000) return json({ error: 'tree too large (30MB cap)' }, 413);
    body = bodySchema.parse(JSON.parse(raw));
  } catch {
    return json({ error: 'invalid publish body' }, 400);
  }

  // The registry trusts the CODE, not the uploader: fetch the snapshot ourselves and
  // re-run the same gate the CLI runs. 100% or nothing.
  const snapshot = await fetchGithubSnapshot(body.owner, body.repo, { ref: body.ref }).catch((err: unknown) => {
    throw Object.assign(new Error(err instanceof Error ? err.message : 'snapshot fetch failed'), { status: 502 });
  });
  const { verdict, tree } = adjudicatePublish(body.tree, snapshot);

  if (!verdict.accepted || !tree) return json({ verdict }, 400);

  const builtWith = Object.values(tree.nodes).some((n) => n.builtWith === 'llm')
    ? `llm:${Object.values(tree.nodes).find((n) => n.provider)?.provider ?? 'unknown'}`
    : 'extractive';
  await saveTree(body.owner, body.repo, {
    tree,
    commitSha: snapshot.sha,
    builtWith,
    claims: verdict.claims,
    verified: verdict.verified,
    freshness: verdict.freshness,
  });

  const origin = new URL(req.url).origin;
  return json({
    verdict,
    url: `${origin}/gh/${body.owner}/${body.repo}`,
    badge: `[![overstory](${origin}/badge/gh/${body.owner}/${body.repo}.svg)](${origin}/gh/${body.owner}/${body.repo})`,
  });
};
