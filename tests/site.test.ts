import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTree } from '../src/build/builder.js';
import { buildSiteData } from '../src/site/data.js';
import { generateSiteHtml } from '../src/site/generate.js';
import type { SiteData } from '../src/site/data.js';

let root: string;
let html: string;
let data: SiteData;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'overstory-site-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# Site Demo\nHas a </script> tag inline to test escaping.\n');
  writeFileSync(join(root, 'src', 'a.ts'), 'export const dangerous = "</script><script>alert(1)</script>";\n');
  const { tree, verification } = await buildTree(root, { provider: null });
  data = buildSiteData(tree, verification);
  html = generateSiteHtml(data);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('buildSiteData', () => {
  it('propagates worst verdict up the tree and computes freshness', () => {
    expect(data.freshness).toBe(1);
    expect(data.nodes[data.root].worst).toBe('VERIFIED');
    expect(data.total).toBeGreaterThan(0);
    expect(data.verified).toBe(data.total);
  });
});

describe('generateSiteHtml', () => {
  it('is fully self-contained: no external scripts', () => {
    expect(html).not.toMatch(/<script[^>]+src=/u);
  });

  it('embeds the tree data as parseable JSON even when source contains </script>', () => {
    const match = /<script id="overstory-data" type="application\/json">([\s\S]*?)<\/script>/u.exec(html);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed.name).toBe(data.name);
    expect(Object.keys(parsed.nodes).length).toBe(Object.keys(data.nodes).length);
    // the dangerous source text survived the round-trip intact
    const leaf = parsed.nodes['leaf:src/a.ts'];
    expect(JSON.stringify(leaf)).toContain('alert(1)');
  });

  it('carries the DESIGN.md identity tokens', () => {
    expect(html).toContain('#46C0A8'); // glacier lichen accent
    expect(html).toContain('#0B0F0D'); // spruce-black base
    expect(html).toContain('Fraunces'); // display voice
    expect(html).toContain('JetBrains Mono'); // evidence voice
    expect(html).toContain('prefers-reduced-motion');
  });

  it('titles the page with the tree name and includes the legend honesty line', () => {
    expect(html).toContain('— OVERSTORY</title>');
    expect(html).toContain('proves provenance, not truth');
  });
});
