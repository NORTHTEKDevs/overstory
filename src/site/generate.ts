import type { SiteData } from './data.js';

const esc = (s: string): string =>
  s.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');

/** Render the self-contained explorer. One HTML file, zero external scripts; data embedded
 * as JSON; fonts degrade gracefully offline (air-gapped is a product promise). */
export const generateSiteHtml = (data: SiteData): string => {
  const json = JSON.stringify(data).replace(/</gu, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(data.name)} — OVERSTORY</title>
<meta name="description" content="Knowledge tree for ${esc(data.name)}: every claim carries a verifiable receipt.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --bg0:#0B0F0D; --bg1:#101512; --bg2:#151C17; --bg3:#1B231D; --line:#243026;
  --text:#F2F5F1; --text2:#A9B4AA; --text3:#6C776E;
  --accent:#46C0A8;
  --verified:#7FB069; --stale:#D9A441; --missing:#C4554D; --unchecked:#8A948B;
  --serif:"Fraunces",Georgia,"Iowan Old Style",serif;
  --sans:"Inter",system-ui,-apple-system,sans-serif;
  --mono:"JetBrains Mono",ui-monospace,"Cascadia Code",Consolas,monospace;
  --ease:cubic-bezier(0.2,0,0,1);
}
* { box-sizing:border-box; margin:0; padding:0; }
html { height:100%; }
body { height:100%; background:var(--bg0); color:var(--text); font:400 14px/1.5 var(--sans); }
button { font:inherit; color:inherit; background:none; border:none; cursor:pointer; }
:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:3px; }
::selection { background:rgba(70,192,168,.25); }

.app { display:grid; grid-template-rows:56px 1fr; height:100%; max-width:1600px; margin:0 auto; }
.frame { display:grid; grid-template-columns:300px 1fr; min-height:0; border-top:1px solid var(--line); }

/* header */
.hdr { display:flex; align-items:center; gap:16px; padding:0 20px; }
.mark { display:flex; align-items:center; gap:10px; }
.mark svg { display:block; }
.wordmark { font:600 17px/1 var(--serif); letter-spacing:.16em; }
.treename { color:var(--text2); font-size:12.5px; padding:3px 8px; background:var(--bg2); border:1px solid var(--line); border-radius:4px; font-family:var(--mono); }
.hdr-spacer { flex:1; }
.fresh { display:flex; align-items:baseline; gap:8px; }
.fresh-num { font:500 17px/1 var(--mono); font-variant-numeric:tabular-nums; color:var(--verified); }
.fresh-num.warn { color:var(--stale); }
.fresh-label { font-size:11px; color:var(--text3); letter-spacing:.04em; text-transform:uppercase; }
.search { position:relative; }
.search input { width:260px; height:32px; padding:0 30px 0 10px; background:var(--bg1); border:1px solid var(--line); border-radius:5px; color:var(--text); font:400 12.5px var(--sans); }
.search input::placeholder { color:var(--text3); }
.search kbd { position:absolute; right:8px; top:7px; font:400 10px var(--mono); color:var(--text3); border:1px solid var(--line); border-radius:3px; padding:1px 5px; background:var(--bg2); }
.rail-toggle { display:none; }

/* tree rail */
.rail { overflow-y:auto; border-right:1px solid var(--line); background:var(--bg1); padding:12px 8px 40px; }
.rail-hint { font-size:11px; color:var(--text3); padding:2px 10px 10px; letter-spacing:.04em; }
.tnode { user-select:none; }
.trow { display:flex; align-items:center; gap:6px; height:28px; padding:0 8px; border-radius:5px; width:100%; text-align:left; font-size:12.5px; color:var(--text2); }
.trow:hover { background:var(--bg2); color:var(--text); }
.trow.active { background:var(--bg3); color:var(--text); }
.trow .caret { width:10px; flex:none; color:var(--text3); font-size:9px; transition:transform 120ms var(--ease); }
.trow.open .caret { transform:rotate(90deg); }
.trow .dot { width:6px; height:6px; border-radius:50%; flex:none; }
.trow .name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--mono); font-size:12px; }
.tchildren { margin-left:14px; border-left:1px solid var(--line); padding-left:4px; }

/* main */
.main { overflow-y:auto; padding:28px 36px 80px; min-width:0; }
.crumbs { display:flex; flex-wrap:wrap; gap:6px; font:400 12px var(--mono); color:var(--text3); margin-bottom:10px; }
.crumbs button { color:var(--text3); padding:1px 2px; }
.crumbs button:hover { color:var(--accent); }
.crumbs .sep { color:var(--line); }
.node-title { font:500 26px/1.2 var(--serif); margin-bottom:4px; }
.node-meta { display:flex; gap:10px; align-items:center; color:var(--text3); font-size:12px; margin-bottom:24px; }
.node-meta .chip { padding:2px 7px; border:1px solid var(--line); border-radius:4px; background:var(--bg1); font-family:var(--mono); font-size:11px; }

.ledger { border:1px solid var(--line); border-radius:8px; background:var(--bg1); overflow:hidden; }
.ledger-head { display:flex; justify-content:space-between; padding:10px 16px; border-bottom:1px solid var(--line); background:var(--bg2); font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--text3); }
.claim { border-bottom:1px solid var(--line); }
.claim:last-child { border-bottom:none; }
.claim-row { display:flex; align-items:flex-start; gap:12px; width:100%; text-align:left; padding:13px 16px; min-height:48px; }
.claim-row:hover { background:var(--bg2); }
.claim-row[aria-expanded="true"] { background:var(--bg2); }
.seal { flex:none; margin-top:1px; display:inline-flex; align-items:center; gap:5px; font:500 10.5px var(--mono); letter-spacing:.05em; padding:2px 8px; border-radius:999px; border:1px solid; }
.seal.VERIFIED { color:var(--verified); border-color:rgba(127,176,105,.4); background:rgba(127,176,105,.08); }
.seal.STALE { color:var(--stale); border-color:rgba(217,164,65,.4); background:rgba(217,164,65,.08); }
.seal.OUT_OF_CORPUS, .seal.UNGROUNDED { color:var(--missing); border-color:rgba(196,85,77,.4); background:rgba(196,85,77,.08); }
.claim-text { flex:1; font-size:14px; color:var(--text); }
.flag { flex:none; font:400 10.5px var(--mono); color:var(--missing); border:1px dashed rgba(196,85,77,.5); padding:1px 6px; border-radius:4px; margin-top:2px; }
.flag.unchecked { color:var(--unchecked); border-color:rgba(138,148,139,.4); }
.receipt { overflow:hidden; }
.receipt-inner { margin:0 16px 14px 16px; border:1px solid var(--line); border-radius:6px; background:var(--bg0); }
.receipt-top { display:flex; flex-wrap:wrap; gap:10px; align-items:center; padding:8px 12px; border-bottom:1px dashed var(--line); font:400 11px var(--mono); color:var(--text2); }
.receipt-top .file { color:var(--accent); }
.receipt-top .hash { color:var(--text3); margin-left:auto; }
.receipt pre { overflow-x:auto; padding:10px 0; font:400 12px/1.5 var(--mono); }
.srcline { display:flex; }
.srcline .ln { flex:none; width:52px; text-align:right; padding-right:12px; color:var(--text3); user-select:none; }
.srcline .code { white-space:pre; color:var(--text2); padding-right:16px; }
.refline { padding:9px 12px; font-size:12.5px; }
.refline button { color:var(--accent); font-family:var(--mono); font-size:12px; }
.refline button:hover { text-decoration:underline; }

.empty { padding:48px 24px; text-align:center; color:var(--text2); }
.empty .cmd { display:inline-block; margin-top:12px; font:400 12.5px var(--mono); background:var(--bg2); border:1px solid var(--line); padding:6px 12px; border-radius:6px; color:var(--text); }

.legend { margin-top:22px; font-size:11.5px; color:var(--text3); line-height:1.7; }
.legend b { color:var(--text2); font-weight:500; }

@media (max-width:720px) {
  .frame { grid-template-columns:1fr; }
  .rail { position:fixed; inset:56px 25% 0 0; z-index:20; transform:translateX(-100%); transition:transform 220ms var(--ease); box-shadow:none; }
  .rail.open { transform:none; border-right:1px solid var(--line); }
  .rail-toggle { display:block; padding:4px 10px; border:1px solid var(--line); border-radius:5px; font-size:12px; color:var(--text2); }
  .search input { width:150px; }
  .main { padding:20px 16px 60px; }
  .treename { display:none; }
}
@media (prefers-reduced-motion:reduce) {
  * { transition:none !important; animation:none !important; }
}
</style>
</head>
<body>
<script id="overstory-data" type="application/json">${json}</script>
<div class="app">
  <header class="hdr">
    <button class="rail-toggle" id="railToggle" aria-label="Toggle tree">tree</button>
    <div class="mark" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="8" r="5.2" stroke="#46C0A8" stroke-width="1.4"/>
        <circle cx="6.6" cy="11.4" r="4" stroke="#7FB069" stroke-width="1.2" opacity=".7"/>
        <circle cx="15.4" cy="11.4" r="4" stroke="#A9B4AA" stroke-width="1.2" opacity=".45"/>
        <path d="M11 13v6" stroke="#6C776E" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    </div>
    <span class="wordmark">OVERSTORY</span>
    <span class="treename" id="treeName"></span>
    <div class="hdr-spacer"></div>
    <div class="fresh" id="fresh" title="Fraction of claims whose receipts verify against the code as of this build">
      <span class="fresh-num" id="freshNum">0%</span>
      <span class="fresh-label" id="freshLabel">verified</span>
    </div>
    <div class="search">
      <input id="searchInput" type="search" placeholder="Search claims" aria-label="Search claims">
      <kbd>/</kbd>
    </div>
  </header>
  <div class="frame">
    <nav class="rail" id="rail" aria-label="Knowledge tree">
      <div class="rail-hint">CANOPY — trust flows up</div>
      <div id="treeRoot" role="tree"></div>
    </nav>
    <main class="main" id="main" tabindex="-1"></main>
  </div>
</div>
<script>
(function () {
  'use strict';
  var DATA = JSON.parse(document.getElementById('overstory-data').textContent);
  var state = { current: DATA.root, open: {}, query: '' };
  state.open[DATA.root] = true;

  var SEAL_LABEL = { VERIFIED: 'verified', STALE: 'stale', OUT_OF_CORPUS: 'missing', UNGROUNDED: 'ungrounded' };
  var SEAL_TITLE = {
    VERIFIED: 'The cited lines exist and are unchanged.',
    STALE: 'The cited evidence changed since this build. Rebuild to refresh.',
    OUT_OF_CORPUS: 'The citation no longer resolves to a file in the corpus.',
    UNGROUNDED: 'This claim carries no valid citation.'
  };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* header */
  document.getElementById('treeName').textContent = DATA.name;
  document.title = DATA.name + ' — OVERSTORY';
  function renderFresh() {
    var pct = Math.round(DATA.freshness * 100);
    var numEl = document.getElementById('freshNum');
    var label = document.getElementById('freshLabel');
    if (pct < 100) numEl.classList.add('warn');
    label.textContent = pct === 100
      ? DATA.total + ' of ' + DATA.total + ' claims verified'
      : (DATA.total - DATA.verified) + ' of ' + DATA.total + ' claims need attention';
    if (reduced) { numEl.textContent = pct + '%'; return; }
    var v = 0, target = pct, vel = 0, start = null;
    function step(ts) {
      if (!start) start = ts;
      vel += (target - v) * 0.12;
      vel *= 0.62;
      v += vel;
      if (Math.abs(target - v) < 0.5 && Math.abs(vel) < 0.5 || ts - start > 1000) {
        numEl.textContent = target + '%';
        return;
      }
      numEl.textContent = Math.round(v) + '%';
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  renderFresh();

  /* tree rail */
  function dotColor(worst) {
    if (worst === 'VERIFIED') return 'var(--verified)';
    if (worst === 'STALE') return 'var(--stale)';
    return 'var(--missing)';
  }
  function renderTree() {
    var host = document.getElementById('treeRoot');
    host.textContent = '';
    host.appendChild(renderTreeNode(DATA.root, 0));
  }
  function renderTreeNode(id, depth) {
    var node = DATA.nodes[id];
    var wrap = el('div', 'tnode');
    var hasKids = node.childIds.length > 0;
    var row = el('button', 'trow' + (state.current === id ? ' active' : '') + (state.open[id] ? ' open' : ''));
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-expanded', hasKids ? String(!!state.open[id]) : 'false');
    row.title = node.verified + ' of ' + node.total + ' claims verified in this subtree';
    row.appendChild(el('span', 'caret', hasKids ? '\\u25B6' : ''));
    var dot = el('span', 'dot');
    dot.style.background = dotColor(node.worst);
    row.appendChild(dot);
    row.appendChild(el('span', 'name', node.kind === 'root' ? node.title : (node.title + (node.kind === 'dir' ? '/' : ''))));
    row.addEventListener('click', function () {
      if (hasKids) state.open[id] = !state.open[id];
      go(id);
    });
    wrap.appendChild(row);
    if (hasKids && state.open[id]) {
      var kids = el('div', 'tchildren');
      kids.setAttribute('role', 'group');
      node.childIds.forEach(function (cid) { kids.appendChild(renderTreeNode(cid, depth + 1)); });
      wrap.appendChild(kids);
    }
    return wrap;
  }

  /* main */
  function crumbsFor(id) {
    var chain = [];
    var path = DATA.nodes[id].path;
    chain.push({ id: DATA.root, label: DATA.nodes[DATA.root].title });
    if (path) {
      var parts = path.split('/');
      var acc = '';
      for (var i = 0; i < parts.length; i++) {
        acc = acc ? acc + '/' + parts[i] : parts[i];
        var nid = (i === parts.length - 1 && DATA.nodes[id].kind === 'leaf') ? 'leaf:' + acc : 'dir:' + acc;
        if (DATA.nodes[nid]) chain.push({ id: nid, label: parts[i] });
      }
    }
    return chain;
  }

  function renderMain() {
    var main = document.getElementById('main');
    main.textContent = '';
    if (state.query) { renderSearch(main); return; }
    var node = DATA.nodes[state.current];

    var crumbs = el('div', 'crumbs');
    crumbsFor(node.id).forEach(function (c, i, arr) {
      var b = el('button', '', c.label);
      b.addEventListener('click', function () { go(c.id); });
      crumbs.appendChild(b);
      if (i < arr.length - 1) crumbs.appendChild(el('span', 'sep', '/'));
    });
    main.appendChild(crumbs);

    main.appendChild(el('h1', 'node-title', node.kind === 'root' ? node.title : node.title));
    var meta = el('div', 'node-meta');
    meta.appendChild(el('span', 'chip', node.kind));
    meta.appendChild(el('span', 'chip', node.builtWith + (node.provider ? ' · ' + node.provider : '')));
    meta.appendChild(el('span', '', node.verified + ' of ' + node.total + ' claims verified in this subtree'));
    main.appendChild(meta);

    if (node.claims.length === 0) {
      var emptyBox = el('div', 'empty');
      emptyBox.appendChild(el('div', '', 'No claims for this node. The file may be empty, binary, or skipped during the build.'));
      main.appendChild(emptyBox);
    } else {
      var ledger = el('div', 'ledger');
      var head = el('div', 'ledger-head');
      head.appendChild(el('span', '', 'Claims'));
      head.appendChild(el('span', '', 'Select a claim to unfold its receipt'));
      ledger.appendChild(head);
      node.claims.forEach(function (claim) { ledger.appendChild(renderClaim(claim)); });
      main.appendChild(ledger);
    }

    var legend = el('div', 'legend');
    legend.innerHTML = 'Seals are mechanical — <b>verified</b>: the cited lines exist and are unchanged · <b>stale</b>: the evidence changed since this build · <b>missing</b>: the citation no longer resolves. Faithfulness is the build-time semantic critique: claims <b>flagged</b> by it stay visible, never hidden. This page proves provenance, not truth — every claim is one click from its evidence.';
    main.appendChild(legend);
  }

  function renderClaim(claim) {
    var wrap = el('div', 'claim');
    var row = el('button', 'claim-row');
    row.setAttribute('aria-expanded', 'false');
    var seal = el('span', 'seal ' + claim.verdict, SEAL_LABEL[claim.verdict]);
    seal.title = SEAL_TITLE[claim.verdict];
    row.appendChild(seal);
    row.appendChild(el('span', 'claim-text', claim.text));
    if (claim.faithfulness === 'unsupported') {
      var f = el('span', 'flag', 'flagged by critique');
      f.title = 'The build-time critique judged the cited lines do not support this claim. Kept visible on purpose.';
      row.appendChild(f);
    } else if (claim.faithfulness === 'unchecked') {
      var f2 = el('span', 'flag unchecked', 'unchecked');
      f2.title = 'No semantic critique ran for this claim (budget or provider limits).';
      row.appendChild(f2);
    }
    var receipt = el('div', 'receipt');
    receipt.hidden = true;
    row.addEventListener('click', function () {
      var openNow = receipt.hidden;
      receipt.hidden = !openNow;
      row.setAttribute('aria-expanded', String(openNow));
      if (openNow && !receipt.firstChild) receipt.appendChild(renderReceipt(claim));
    });
    wrap.appendChild(row);
    wrap.appendChild(receipt);
    return wrap;
  }

  function renderReceipt(claim) {
    var inner = el('div', 'receipt-inner');
    if (claim.spans.length === 0 && claim.refs.length === 0) {
      inner.appendChild(el('div', 'refline', 'No citations. This is what ungrounded looks like — the seal above says so.'));
      return inner;
    }
    claim.spans.forEach(function (span) {
      var top = el('div', 'receipt-top');
      top.appendChild(el('span', 'file', span.file + ':' + span.startLine + '-' + span.endLine));
      top.appendChild(el('span', 'hash', 'sha256 ' + span.hash.slice(0, 12)));
      inner.appendChild(top);
      var pre = el('pre');
      var lines = span.text.split('\\n');
      for (var i = 0; i < lines.length; i++) {
        var lineRow = el('div', 'srcline');
        lineRow.appendChild(el('span', 'ln', String(span.startLine + i)));
        lineRow.appendChild(el('span', 'code', lines[i] === '' ? ' ' : lines[i]));
        pre.appendChild(lineRow);
      }
      inner.appendChild(pre);
    });
    claim.refs.forEach(function (ref) {
      var target = DATA.nodes[ref.nodeId];
      var refClaim = null;
      if (target) target.claims.forEach(function (c) { if (c.id === ref.claimId) refClaim = c; });
      var line = el('div', 'refline');
      line.appendChild(document.createTextNode('Grounded in '));
      var link = el('button', '', target ? (target.path || target.title) : ref.nodeId);
      link.addEventListener('click', function () { go(ref.nodeId); });
      line.appendChild(link);
      if (refClaim) line.appendChild(document.createTextNode(' — "' + refClaim.text + '"'));
      inner.appendChild(line);
    });
    return inner;
  }

  /* search */
  function renderSearch(main) {
    var q = state.query.toLowerCase();
    var terms = q.split(/\\s+/).filter(Boolean);
    var hits = [];
    Object.keys(DATA.nodes).forEach(function (nid) {
      DATA.nodes[nid].claims.forEach(function (claim) {
        var hay = (claim.text + ' ' + DATA.nodes[nid].path).toLowerCase();
        var score = 0;
        terms.forEach(function (t) { if (hay.indexOf(t) >= 0) score += 1; });
        if (score === terms.length && terms.length > 0) hits.push({ nid: nid, claim: claim, score: score });
      });
    });
    main.appendChild(el('h1', 'node-title', 'Search'));
    var meta = el('div', 'node-meta');
    meta.appendChild(el('span', '', hits.length + (hits.length === 1 ? ' claim matches "' : ' claims match "') + state.query + '"'));
    main.appendChild(meta);
    if (hits.length === 0) {
      var none = el('div', 'empty');
      none.appendChild(el('div', '', 'No claims match "' + state.query + '". Try a file name or an exported symbol.'));
      main.appendChild(none);
      return;
    }
    var ledger = el('div', 'ledger');
    hits.slice(0, 50).forEach(function (hit) {
      var wrap = el('div', 'claim');
      var row = el('button', 'claim-row');
      var seal = el('span', 'seal ' + hit.claim.verdict, SEAL_LABEL[hit.claim.verdict]);
      row.appendChild(seal);
      var txt = el('span', 'claim-text');
      txt.appendChild(el('div', '', hit.claim.text));
      var where = el('div', '');
      where.style.cssText = 'font:400 11px var(--mono);color:var(--text3);margin-top:3px';
      where.textContent = DATA.nodes[hit.nid].path || DATA.nodes[hit.nid].title;
      txt.appendChild(where);
      row.appendChild(txt);
      row.addEventListener('click', function () {
        state.query = '';
        document.getElementById('searchInput').value = '';
        go(hit.nid);
      });
      wrap.appendChild(row);
      ledger.appendChild(wrap);
    });
    main.appendChild(ledger);
  }

  /* navigation + keyboard */
  function openAncestors(id) {
    var node = DATA.nodes[id];
    if (!node) return;
    var path = node.path;
    state.open[DATA.root] = true;
    if (!path) return;
    var parts = path.split('/');
    var acc = '';
    for (var i = 0; i < parts.length; i++) {
      acc = acc ? acc + '/' + parts[i] : parts[i];
      if (DATA.nodes['dir:' + acc]) state.open['dir:' + acc] = true;
    }
  }
  function go(id) {
    if (!DATA.nodes[id]) return;
    state.current = id;
    openAncestors(id);
    renderTree();
    renderMain();
    document.getElementById('rail').classList.remove('open');
    document.getElementById('main').scrollTop = 0;
  }

  document.getElementById('searchInput').addEventListener('input', function (e) {
    state.query = e.target.value.trim();
    renderMain();
  });
  document.getElementById('searchInput').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      state.query = '';
      e.target.value = '';
      e.target.blur();
      renderMain();
    }
  });
  document.getElementById('railToggle').addEventListener('click', function () {
    document.getElementById('rail').classList.toggle('open');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== document.getElementById('searchInput')) {
      e.preventDefault();
      document.getElementById('searchInput').focus();
    }
  });

  renderTree();
  renderMain();
})();
</script>
</body>
</html>
`;
};
