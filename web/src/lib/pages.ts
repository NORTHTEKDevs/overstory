import { buildSiteData, generateSiteHtml, verifyTree } from './engine.js';
import type { GithubSnapshot, Tree } from './engine.js';

const esc = (s: string): string =>
  s.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');

/** Hosted explorer = the same self-contained explorer the CLI exports, plus a slim
 * registry bar naming the verified sha and when the gate last ran. */
export const explorerHtml = (
  tree: Tree,
  snapshot: GithubSnapshot | null,
  meta: { owner: string; repo: string; sha: string; builtWith: string; verifiedAt: string; origin?: string },
): string => {
  const verification = snapshot ? verifyTree(tree, snapshot.corpus) : null;
  const data = buildSiteData(tree, verification ?? verifyTree(tree, { root: '', files: new Map() }), snapshot?.corpus);
  const pct = Math.round(data.freshness * 100);
  const base = generateSiteHtml(data, {
    ask: {
      cloneUrl: `https://github.com/${meta.owner}/${meta.repo}.git`,
      repoLabel: meta.repo,
    },
    share: meta.origin
      ? {
          url: `${meta.origin}/gh/${meta.owner}/${meta.repo}`,
          status: `${pct}% of ${data.total.toLocaleString('en-US')} statements verified against the code right now.`,
        }
      : undefined,
  });
  const bar = `
<div style="position:fixed;top:0;left:0;right:0;z-index:99;display:flex;gap:14px;align-items:center;padding:8px 16px;background:var(--bg1);border-bottom:1px solid var(--line);font:500 12px 'JetBrains Mono',monospace;">
  <a href="/" style="color:var(--accent);text-decoration:none;font-family:Fraunces,Georgia,serif;letter-spacing:.12em;font-size:13px;">OVERSTORY</a>
  <span style="color:var(--text2);">${esc(meta.owner)}/${esc(meta.repo)}</span>
  <span style="color:${pct === 100 ? 'var(--verified)' : 'var(--stale)'};">${pct}% verified</span>
  <span style="color:var(--text3);">@ ${esc(meta.sha.slice(0, 7))} · ${esc(meta.builtWith)} · gate ran ${esc(meta.verifiedAt)}</span>
  <span style="margin-left:auto;color:var(--text3);">private repos: <code style="background:var(--bg2);padding:1px 6px;border-radius:4px;">npx @northtek/overstory serve</code></span>
  <a href="https://github.com/${esc(meta.owner)}/${esc(meta.repo)}" style="color:var(--text2);text-decoration:none;">GitHub →</a>
</div>
<div style="height:36px;"></div>`;
  return base.replace('<div class="app">', bar + '<div class="app" style="height:calc(100% - 36px);">');
};

export const badgeSvg = (pct: number | null): string => {
  const label = 'overstory';
  const value = pct === null ? 'not indexed' : `verified ${pct}%`;
  const color = pct === null ? '#98A19A' : pct === 100 ? '#1F7A5C' : pct >= 90 ? '#B8860B' : '#C0453B';
  const lw = 62;
  const vw = pct === null ? 78 : 84;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="20" role="img" aria-label="${label}: ${value}">
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<rect rx="3" width="${lw + vw}" height="20" fill="#2A302C"/>
<rect rx="3" x="${lw}" width="${vw}" height="20" fill="${color}"/>
<rect rx="3" width="${lw + vw}" height="20" fill="url(#s)"/>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${label}</text>
<text x="${lw + vw / 2}" y="14">${value}</text>
</g></svg>`;
};

export const errorHtml = (title: string, message: string, hint?: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} — OVERSTORY</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,450;9..144,560&family=Inter:wght@400;500&family=JetBrains+Mono&display=swap" rel="stylesheet">
<style>body{background:#FAF9F5;color:#1A1D1B;font:400 15px/1.6 Inter,system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
@media (prefers-color-scheme:dark){body{background:#101312;color:#F0F2EF}}
.card{max-width:520px;text-align:center}h1{font:450 26px/1.3 Fraunces,Georgia,serif;margin:0 0 10px}p{color:#5C6660;margin:0 0 8px}
code{font:400 13px 'JetBrains Mono',monospace;background:rgba(31,122,92,.09);padding:3px 8px;border-radius:6px}</style>
</head><body><div class="card"><h1>${esc(title)}</h1><p>${esc(message)}</p>${hint ? `<p><code>${esc(hint)}</code></p>` : ''}
<p><a href="/" style="color:#1F7A5C">← overstory registry</a></p></div></body></html>`;
