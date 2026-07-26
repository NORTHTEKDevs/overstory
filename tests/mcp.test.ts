import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildTree } from '../src/build/builder.js';
import { createOverstoryServer } from '../src/mcp/server.js';

let root: string;
let client: Client;

const callJson = async (name: string, args: Record<string, unknown> = {}): Promise<any> => {
  const res: any = await client.callTool({ name, arguments: args });
  return JSON.parse(res.content[0].text);
};

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'overstory-mcp-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# MCP Demo\nA repo for MCP tests.\n');
  writeFileSync(join(root, 'src', 'gate.ts'), 'export function verifyClaim(claim: string) {\n  return claim.length > 0;\n}\n');
  await buildTree(root, { provider: null });

  const server = createOverstoryServer(root);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('MCP server round-trip', () => {
  it('overstory_map returns freshness and structure', async () => {
    const map = await callJson('overstory_map');
    expect(map.freshness).toBe(1);
    expect(map.children.length).toBeGreaterThan(0);
  });

  it('overstory_node resolves by path with receipts', async () => {
    const node = await callJson('overstory_node', { idOrPath: 'src/gate.ts' });
    expect(node.id).toBe('leaf:src/gate.ts');
    expect(node.claims.length).toBeGreaterThan(0);
    expect(node.claims[0].verdict).toBe('VERIFIED');
    expect(node.claims[0].receipts[0].file).toBe('src/gate.ts');
  });

  it('overstory_search finds relevant claims', async () => {
    const hits = await callJson('overstory_search', { query: 'verifyClaim gate' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].claimId).toContain('src/gate.ts');
  });

  it('overstory_verify: true citation RESOLVED with receipt; fabricated citation OUT_OF_CORPUS; empty UNGROUNDED', async () => {
    const out = await callJson('overstory_verify', {
      claims: [
        { text: 'verifyClaim checks claim length', citations: [{ file: 'src/gate.ts', startLine: 1, endLine: 3 }] },
        { text: 'there is a database layer', citations: [{ file: 'src/db.ts', startLine: 1, endLine: 5 }] },
        { text: 'unfounded assertion', citations: [] },
      ],
    });
    expect(out.results[0].verdict).toBe('RESOLVED');
    expect(out.results[0].receipts[0].text).toContain('verifyClaim');
    expect(out.results[1].verdict).toBe('OUT_OF_CORPUS');
    expect(out.results[2].verdict).toBe('UNGROUNDED');
    expect(out.summary).toEqual({ resolved: 1, of: 3 });
  });

  it('errors clearly when no tree exists', async () => {
    const server2 = createOverstoryServer(join(root, 'src')); // no .overstory here
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server2.connect(st);
    const c2 = new Client({ name: 't2', version: '0' });
    await c2.connect(ct);
    const res: any = await c2.callTool({ name: 'overstory_map', arguments: {} });
    expect(JSON.parse(res.content[0].text).error).toContain('build');
  });
});

describe('version reporting', () => {
  it('the MCP handshake advertises the shipped package version, not a hardcoded one', async () => {
    const { packageVersion } = await import('../src/core/version.js');
    const pkg: { version: string } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(packageVersion()).toBe(pkg.version);
    // The server object must report the same value the CLI's --version prints.
    const server = createOverstoryServer(process.cwd()) as unknown as { server: { _serverInfo: { version: string } } };
    expect(server.server._serverInfo.version).toBe(pkg.version);
  });
});
