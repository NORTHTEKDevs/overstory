import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { buildTree } from '../src/build/builder.js';
import { mockProvider } from '../src/llm/mock.js';
import { createOverstoryHttpServer } from '../src/serve/server.js';

let root: string;
let server: Server;
let base: string;

const askMock = () =>
  mockProvider((prompt: string) => {
    if (prompt.includes('"subqueries"')) return '{"subqueries":["gate verify"]}';
    return JSON.stringify({
      answer: [{ text: 'The gate verifies claims mechanically.', refs: ['leaf:src/gate.ts#0'] }],
    });
  });

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'overstory-serve-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# Serve Demo\nA repo for serve tests.\n');
  writeFileSync(join(root, 'src', 'gate.ts'), 'export function verifyClaim(claim: string) {\n  return claim.length > 0;\n}\n');
  await buildTree(root, { provider: null });

  server = createOverstoryHttpServer(root, { provider: askMock() });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  rmSync(root, { recursive: true, force: true });
});

describe('overstory serve', () => {
  it('serves the app shell with the v2 identity', async () => {
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain('OVERSTORY');
    expect(html).toContain('#1F7A5C'); // canopy accent
    expect(html).toContain('#FAF9F5'); // paper light bg
    expect(html).toContain('data-theme="dark"');
    expect(html).not.toMatch(/<script[^>]+src=/u); // self-contained app JS
  });

  it('overview reports freshness, provider, and grounded suggestions', async () => {
    const o = await (await fetch(`${base}/api/overview`)).json();
    expect(o.freshness).toBe(1);
    expect(o.total).toBeGreaterThan(0);
    expect(o.provider).toContain('mock');
    expect(o.suggestions.length).toBeGreaterThan(1);
  });

  it('tree endpoint returns the explorable model', async () => {
    const d = await (await fetch(`${base}/api/tree`)).json();
    expect(d.nodes['leaf:src/gate.ts']).toBeDefined();
    expect(d.freshness).toBe(1);
  });

  it('ask streams phases then a gated answer over SSE, and persists the thread', async () => {
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'how does the gate verify claims?' }),
    });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const raw = await res.text();
    expect(raw).toContain('event: thread');
    expect(raw).toContain('event: phase');
    expect(raw).toContain('"phase":"search"');
    expect(raw).toContain('event: answer');
    const answerLine = raw.split('\n\n').find((b) => b.startsWith('event: answer'))!;
    const answer = JSON.parse(answerLine.split('\n')[1].slice(6));
    expect(answer.sentences[0].verdict).toBe('VERIFIED');
    expect(answer.grounding).toBe(1);

    const threads = await (await fetch(`${base}/api/threads`)).json();
    expect(threads.length).toBe(1);
    const thread = await (await fetch(`${base}/api/thread?id=${threads[0].id}`)).json();
    expect(thread.turns).toHaveLength(1);
    expect(thread.turns[0].result.sentences[0].text).toContain('gate verifies');
  });

  it('verify endpoint notarizes external claims', async () => {
    const out = await (
      await fetch(`${base}/api/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          claims: [
            { text: 'verifyClaim checks length', citations: [{ file: 'src/gate.ts', startLine: 1, endLine: 3 }] },
            { text: 'fabricated', citations: [{ file: 'src/nope.ts', startLine: 1, endLine: 2 }] },
          ],
        }),
      })
    ).json();
    expect(out.results[0].verdict).toBe('RESOLVED');
    expect(out.results[1].verdict).toBe('OUT_OF_CORPUS');
    expect(out.summary).toEqual({ resolved: 1, of: 2 });
  });

  it('thread deletion works and bad routes 404 cleanly', async () => {
    const threads = await (await fetch(`${base}/api/threads`)).json();
    const del = await fetch(`${base}/api/thread?id=${threads[0].id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect((await (await fetch(`${base}/api/threads`)).json()).length).toBe(0);
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
  });

  it('malformed ask body is rejected without crashing the server', async () => {
    const res = await fetch(`${base}/api/ask`, { method: 'POST', body: '{"question":""}' });
    expect(res.status).toBe(400);
    expect((await fetch(`${base}/api/overview`)).status).toBe(200); // still alive
  });
});
