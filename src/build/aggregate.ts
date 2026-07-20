import { z } from 'zod';
import type { Claim, TreeNode } from '../core/types.js';
import type { ChatProvider } from '../llm/provider.js';

const aggSchema = z.object({
  claims: z
    .array(z.object({ text: z.string().min(3), refs: z.array(z.string()).min(1) }))
    .min(1)
    .max(8),
});

const AGG_SYSTEM = `You are the roll-up layer of a provenance-gated knowledge tree. You describe what a directory/module IS from its children's verified claims. Every claim must reference the child claims that support it. Never introduce facts absent from the children.`;

const aggPrompt = (title: string, children: TreeNode[]): string => {
  const lines: string[] = [];
  for (const child of children) {
    lines.push(`CHILD ${child.id} (${child.title}):`);
    for (const claim of child.claims.slice(0, 5)) lines.push(`  [${claim.id}] ${claim.text}`);
  }
  return `Summarize what "${title}" is and does in 3-6 claims for a developer seeing it for the first time. Each claim cites the child claim ids that support it.

Return ONLY JSON: {"claims":[{"text":"...","refs":["<claim id>", ...]}]}

${lines.join('\n')}`;
};

/** Deterministic roll-up: one claim per child, grounded in the child's first claim. */
export const extractiveAggregate = (children: TreeNode[]): Omit<Claim, 'id'>[] =>
  children
    .filter((c) => c.claims.length > 0)
    .slice(0, 8)
    .map((child) => ({
      text: `Contains ${child.kind === 'leaf' ? child.path : `${child.title}/`} — ${child.claims[0].text}`,
      citations: [{ kind: 'claim' as const, ref: { nodeId: child.id, claimId: child.claims[0].id } }],
      faithfulness: 'supported' as const,
    }));

/** Interior-node claims. LLM path grounds every claim in child claim refs; invalid refs are
 * dropped; unusable output falls back to extractive. */
export const aggregateClaims = async (
  provider: ChatProvider | null,
  title: string,
  children: TreeNode[],
  idPrefix: string,
): Promise<Claim[]> => {
  const finish = (drafts: Omit<Claim, 'id'>[]): Claim[] =>
    drafts.map((c, i) => ({ ...c, id: `${idPrefix}#${i}` }));

  const withClaims = children.filter((c) => c.claims.length > 0);
  if (!provider || withClaims.length === 0) return finish(extractiveAggregate(children));

  const valid = new Map<string, { nodeId: string; claimId: string }>();
  for (const child of withClaims) for (const claim of child.claims) valid.set(claim.id, { nodeId: child.id, claimId: claim.id });

  try {
    const raw = await provider.chat(aggPrompt(title, withClaims), { json: true, system: AGG_SYSTEM });
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    const parsed = aggSchema.parse(JSON.parse(first >= 0 ? raw.slice(first, last + 1) : raw));
    const drafts: Omit<Claim, 'id'>[] = [];
    for (const d of parsed.claims) {
      const refs = d.refs.filter((r) => valid.has(r));
      if (refs.length === 0) continue;
      drafts.push({
        text: d.text.trim(),
        citations: refs.map((r) => ({ kind: 'claim' as const, ref: valid.get(r)! })),
        faithfulness: 'unchecked',
      });
    }
    if (drafts.length === 0) return finish(extractiveAggregate(children));
    return finish(drafts);
  } catch {
    return finish(extractiveAggregate(children));
  }
};
