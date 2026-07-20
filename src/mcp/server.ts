import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadCorpus } from '../core/corpus.js';
import { verifyTree } from '../core/gate.js';
import { loadTree, treePath } from '../core/store.js';
import { buildClaimIndex } from '../query/ask.js';
import type { CorpusSnapshot, Tree } from '../core/types.js';

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });
const jsonError = (message: string) => ({ ...json({ error: message }), isError: true });

const NEEDS_BUILD = 'No knowledge tree found. Run `npx @northtek/overstory build` in the project first.';

/** MCP server over a built tree. The host agent (Claude Code, Cursor, ...) does the
 * thinking; these tools return evidence with receipts and mechanically check the host's
 * own citations. Verification here is provenance + freshness — deliberately never a
 * claim of semantic truth. */
export const createOverstoryServer = (root: string): McpServer => {
  const server = new McpServer({ name: 'overstory', version: '0.1.0' });

  const load = async (): Promise<{ tree: Tree; corpus: CorpusSnapshot } | null> => {
    const tree = await loadTree(treePath(root));
    if (!tree) return null;
    const corpus = await loadCorpus(root);
    return { tree, corpus };
  };

  server.registerTool(
    'overstory_map',
    {
      description:
        'Overview of the knowledge tree for this repo: root claims, top-level structure, and live freshness (fraction of claims whose receipts still verify against the current code).',
      inputSchema: {},
    },
    async () => {
      const loaded = await load();
      if (!loaded) return jsonError(NEEDS_BUILD);
      const { tree, corpus } = loaded;
      const verification = verifyTree(tree, corpus);
      const rootNode = tree.nodes[tree.root];
      return json({
        name: tree.name,
        builtAt: tree.builtAt,
        freshness: Number(verification.freshness.toFixed(3)),
        rootClaims: rootNode.claims.map((c) => ({ id: c.id, text: c.text, verdict: verification.verdicts.get(c.id), faithfulness: c.faithfulness })),
        children: rootNode.childIds.map((id) => {
          const n = tree.nodes[id];
          const counts = verification.byNode.get(id);
          return { id, path: n.path, kind: n.kind, summary: n.summary, claims: counts?.total ?? 0, verified: counts?.verified ?? 0 };
        }),
      });
    },
  );

  server.registerTool(
    'overstory_node',
    {
      description:
        'One tree node (by node id like "leaf:src/gate.ts" / "dir:src", or by file/dir path) with all its claims, verdicts, faithfulness tiers, and source receipts (file:line spans).',
      inputSchema: { idOrPath: z.string().describe('Node id or repo-relative path') },
    },
    async ({ idOrPath }) => {
      const loaded = await load();
      if (!loaded) return jsonError(NEEDS_BUILD);
      const { tree, corpus } = loaded;
      const node =
        tree.nodes[idOrPath] ??
        Object.values(tree.nodes).find((n) => n.path === idOrPath || n.path === idOrPath.replace(/\\/gu, '/'));
      if (!node) return jsonError(`No node "${idOrPath}". Try overstory_map or overstory_search first.`);
      const verification = verifyTree(tree, corpus);
      return json({
        id: node.id,
        kind: node.kind,
        path: node.path,
        builtWith: node.builtWith,
        childIds: node.childIds,
        claims: node.claims.map((c) => ({
          id: c.id,
          text: c.text,
          verdict: verification.verdicts.get(c.id),
          faithfulness: c.faithfulness,
          receipts: c.citations.map((cit) =>
            cit.kind === 'span'
              ? { file: cit.span.file, lines: `${cit.span.startLine}-${cit.span.endLine}`, text: cit.span.text.slice(0, 500) }
              : { claimRef: `${cit.ref.nodeId} :: ${cit.ref.claimId}` },
          ),
        })),
      });
    },
  );

  server.registerTool(
    'overstory_search',
    {
      description:
        'Search the tree claims (BM25) for evidence relevant to a question. Returns claims with ids, verdicts, and source spans — cite these ids in answers, then check yourself with overstory_verify.',
      inputSchema: {
        query: z.string().describe('Search query'),
        k: z.number().int().min(1).max(25).optional().describe('Max results, default 8'),
      },
    },
    async ({ query, k }) => {
      const loaded = await load();
      if (!loaded) return jsonError(NEEDS_BUILD);
      const { tree, corpus } = loaded;
      const verification = verifyTree(tree, corpus);
      const { index, byId } = buildClaimIndex(tree);
      const hits = index.search(query, k ?? 8);
      return json(
        hits.map(({ id, score }) => {
          const { claim, nodeId } = byId.get(id)!;
          return {
            claimId: id,
            node: nodeId,
            path: tree.nodes[nodeId].path,
            text: claim.text,
            verdict: verification.verdicts.get(id),
            faithfulness: claim.faithfulness,
            score: Number(score.toFixed(3)),
            spans: claim.citations
              .filter((c): c is Extract<typeof c, { kind: 'span' }> => c.kind === 'span')
              .map((c) => `${c.span.file}:${c.span.startLine}-${c.span.endLine}`),
          };
        }),
      );
    },
  );

  server.registerTool(
    'overstory_verify',
    {
      description:
        'Notarize YOUR drafted answer about this repo. Submit each claim with its file:line citations; returns per-claim verdicts — RESOLVED (citation exists; receipt text returned so you can self-check it truly supports your claim), OUT_OF_CORPUS (file/lines do not exist — fix before answering), UNGROUNDED (no citations) — plus corroborating verified tree claims when found. This checks provenance mechanically; it does not certify truth.',
      inputSchema: {
        claims: z
          .array(
            z.object({
              text: z.string().describe('One atomic claim from your draft'),
              citations: z
                .array(z.object({ file: z.string(), startLine: z.number().int().min(1), endLine: z.number().int().min(1) }))
                .describe('file:line evidence for this claim'),
            }),
          )
          .min(1)
          .max(30),
      },
    },
    async ({ claims }) => {
      const loaded = await load();
      if (!loaded) return jsonError(NEEDS_BUILD);
      const { tree, corpus } = loaded;
      const verification = verifyTree(tree, corpus);
      const { index, byId } = buildClaimIndex(tree);
      const results = claims.map((claim) => {
        if (claim.citations.length === 0) return { text: claim.text, verdict: 'UNGROUNDED' as const, receipts: [], corroboration: null };
        const receipts: Array<{ file: string; lines: string; text: string } | { missing: string }> = [];
        let bad = false;
        for (const c of claim.citations) {
          const file = corpus.files.get(c.file.replace(/\\/gu, '/'));
          if (!file || c.startLine > file.lines.length || c.endLine < c.startLine) {
            receipts.push({ missing: `${c.file}:${c.startLine}-${c.endLine}` });
            bad = true;
            continue;
          }
          receipts.push({
            file: c.file,
            lines: `${c.startLine}-${Math.min(c.endLine, file.lines.length)}`,
            text: file.lines.slice(c.startLine - 1, Math.min(c.endLine, file.lines.length)).join('\n').slice(0, 800),
          });
        }
        const top = index.search(claim.text, 1)[0];
        const corroboration =
          top && verification.verdicts.get(top.id) === 'VERIFIED'
            ? { claimId: top.id, text: byId.get(top.id)!.claim.text, score: Number(top.score.toFixed(3)) }
            : null;
        return { text: claim.text, verdict: bad ? ('OUT_OF_CORPUS' as const) : ('RESOLVED' as const), receipts, corroboration };
      });
      const resolved = results.filter((r) => r.verdict === 'RESOLVED').length;
      return json({ results, summary: { resolved, of: results.length } });
    },
  );

  return server;
};

export const runStdioServer = async (root: string): Promise<void> => {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const server = createOverstoryServer(root);
  await server.connect(new StdioServerTransport());
};
