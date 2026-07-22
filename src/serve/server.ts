import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { stat } from 'node:fs/promises';
import { z } from 'zod';
import { loadCorpus } from '../core/corpus.js';
import { verifyTree } from '../core/gate.js';
import { loadTree, treePath } from '../core/store.js';
import type { CorpusSnapshot, Tree, TreeVerification } from '../core/types.js';
import type { ChatProvider } from '../llm/provider.js';
import { ask, buildClaimIndex } from '../query/ask.js';
import { notarizeClaims } from '../query/notarize.js';
import { buildSiteData } from '../site/data.js';
import { appHtml } from './app.js';
import { ThreadStore } from './threads.js';

const askBodySchema = z.object({
  question: z.string().min(2).max(2000),
  threadId: z.string().optional(),
});

const verifyBodySchema = z.object({
  claims: z
    .array(
      z.object({
        text: z.string(),
        citations: z.array(z.object({ file: z.string(), startLine: z.number().int().min(1), endLine: z.number().int().min(1) })),
      }),
    )
    .min(1)
    .max(30),
});

interface LoadedState {
  tree: Tree;
  corpus: CorpusSnapshot;
  /** Unscoped corpus for the finding scanner (a src/** build scope cannot see tests/). */
  scanCorpus: CorpusSnapshot;
  verification: TreeVerification;
  treeMtimeMs: number;
  corpusAt: number;
}

export interface ServeOptions {
  provider: ChatProvider | null;
  port?: number;
  onReady?: (url: string) => void;
}

const sendJson = (res: ServerResponse, status: number, value: unknown): void => {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
};

const readBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

/** Suggested questions derived from what the tree actually knows. */
const suggestionsFor = (tree: Tree): string[] => {
  const dirs = Object.values(tree.nodes)
    .filter((n) => n.kind === 'dir' && n.claims.length > 0)
    .slice(0, 2)
    .map((n) => `What lives in ${n.path}/ and how does it fit together?`);
  return [
    `What does ${tree.name} do, in one paragraph?`,
    ...dirs,
    'Where would a new contributor start reading?',
  ].slice(0, 4);
};

export const createOverstoryHttpServer = (root: string, opts: ServeOptions): Server => {
  const threads = new ThreadStore(root);
  let cached: LoadedState | null = null;

  const load = async (): Promise<LoadedState | null> => {
    let mtimeMs = 0;
    try {
      mtimeMs = (await stat(treePath(root))).mtimeMs;
    } catch {
      return null;
    }
    const now = Date.now();
    if (cached && cached.treeMtimeMs === mtimeMs && now - cached.corpusAt < 10_000) return cached;
    const tree = await loadTree(treePath(root));
    if (!tree) return null;
    const corpus = await loadCorpus(root, tree.corpusOptions ?? {});
    const scanCorpus = tree.corpusOptions?.include
      ? await loadCorpus(root, { maxFiles: tree.corpusOptions.maxFiles })
      : corpus;
    const verification = verifyTree(tree, corpus);
    cached = { tree, corpus, scanCorpus, verification, treeMtimeMs: mtimeMs, corpusAt: now };
    return cached;
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = `${req.method} ${url.pathname}`;
    try {
      if (route === 'GET /') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(appHtml());
        return;
      }

      if (route === 'GET /api/overview') {
        const state = await load();
        if (!state) return sendJson(res, 404, { error: 'No tree found. Run: overstory build' });
        const { tree, verification } = state;
        return sendJson(res, 200, {
          name: tree.name,
          builtAt: tree.builtAt,
          generator: tree.generator,
          provider: opts.provider?.name ?? 'extractive (no LLM)',
          freshness: verification.freshness,
          verified: [...verification.verdicts.values()].filter((v) => v === 'VERIFIED').length,
          total: verification.verdicts.size,
          nodes: Object.keys(tree.nodes).length,
          suggestions: suggestionsFor(tree),
        });
      }

      if (route === 'GET /api/tree') {
        const state = await load();
        if (!state) return sendJson(res, 404, { error: 'No tree found. Run: overstory build' });
        return sendJson(res, 200, buildSiteData(state.tree, state.verification, state.scanCorpus));
      }

      if (route === 'GET /api/threads') return sendJson(res, 200, await threads.list());

      if (route === 'GET /api/thread') {
        const thread = await threads.get(url.searchParams.get('id') ?? '');
        return thread ? sendJson(res, 200, thread) : sendJson(res, 404, { error: 'no such thread' });
      }

      if (route === 'DELETE /api/thread') {
        const ok = await threads.remove(url.searchParams.get('id') ?? '');
        return sendJson(res, ok ? 200 : 404, { ok });
      }

      if (route === 'POST /api/verify') {
        const state = await load();
        if (!state) return sendJson(res, 404, { error: 'No tree found. Run: overstory build' });
        const body = verifyBodySchema.parse(await readBody(req));
        const { index, byId } = buildClaimIndex(state.tree);
        return sendJson(res, 200, notarizeClaims(body.claims, state.tree, state.corpus, state.verification, index, byId));
      }

      if (route === 'POST /api/ask') {
        const state = await load();
        if (!state) return sendJson(res, 404, { error: 'No tree found. Run: overstory build' });
        const body = askBodySchema.parse(await readBody(req));

        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        const send = (event: string, data: unknown): void => {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        const thread = body.threadId
          ? (await threads.get(body.threadId)) ?? (await threads.create(body.question))
          : await threads.create(body.question);
        send('thread', { id: thread.id, title: thread.title });

        try {
          const result = await ask(body.question, state.tree, state.corpus, opts.provider, {
            onPhase: (e) => send('phase', e),
          });
          await threads.addTurn(thread.id, { question: body.question, result, at: new Date().toISOString() });
          send('answer', result);
        } catch (err) {
          send('error', { message: err instanceof Error ? err.message : String(err) });
        }
        res.end();
        return;
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
      } else {
        res.end();
      }
    }
  });

  return server;
};

export const serve = async (root: string, opts: ServeOptions): Promise<Server> => {
  const server = createOverstoryHttpServer(root, opts);
  const port = opts.port ?? 7433;
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolvePromise());
  });
  opts.onReady?.(`http://127.0.0.1:${port}`);
  return server;
};
