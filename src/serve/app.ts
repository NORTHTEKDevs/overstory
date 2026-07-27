/** The served application shell. All data is client-fetched from /api/*; this template has
 * zero server-side interpolation. Client JS avoids backticks entirely (template-literal
 * safety inside this TS string). */
export const appHtml = (): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OVERSTORY</title>
<meta name="description" content="Ask your codebase. Every citation is a stamped receipt.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,450;9..144,560&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --bg:#FAF9F5; --surface:#FFFFFF; --subtle:#F1EFE9; --line:#E4E1D8;
  --text:#1A1D1B; --text2:#5C6660; --text3:#98A19A;
  --accent:#1F7A5C; --accent-hover:#196349; --accent-soft:rgba(31,122,92,.09);
  --verified:#1F7A5C; --stale:#B8860B; --missing:#C0453B; --unchecked:#98A19A;
  --shadow-sm:0 1px 2px rgba(20,24,22,.06); --shadow-md:0 1px 3px rgba(20,24,22,.08), 0 4px 16px rgba(20,24,22,.05);
  --serif:"Fraunces",Georgia,serif; --sans:"Inter",system-ui,sans-serif; --mono:"JetBrains Mono",ui-monospace,Consolas,monospace;
  --ease:cubic-bezier(0.2,0,0,1);
}
[data-theme="dark"] {
  --bg:#101312; --surface:#171B19; --subtle:#1D2220; --line:#2A302C;
  --text:#F0F2EF; --text2:#A3ACA5; --text3:#6E7770;
  --accent:#34A47C; --accent-hover:#3FB98D; --accent-soft:rgba(52,164,124,.14);
  --verified:#34A47C; --stale:#D9A441; --missing:#D06258; --unchecked:#6E7770;
  --shadow-sm:none; --shadow-md:none;
}
* { box-sizing:border-box; margin:0; padding:0; }
html,body { height:100%; }
body { background:var(--bg); color:var(--text); font:400 15px/1.6 var(--sans); }
button { font:inherit; color:inherit; background:none; border:none; cursor:pointer; }
textarea { font:inherit; color:inherit; }
:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:4px; }
::selection { background:var(--accent-soft); }
@media (prefers-reduced-motion:reduce) { * { transition:none !important; animation:none !important; } }

.shell { display:grid; grid-template-columns:264px 1fr; height:100%; }

/* ---------- sidebar ---------- */
.side { display:flex; flex-direction:column; background:var(--subtle); border-right:1px solid var(--line); padding:16px 12px; gap:6px; min-height:0; }
.brand { display:flex; align-items:center; gap:9px; padding:6px 10px 14px; }
.brand svg { flex:none; }
.brand .word { font:560 15px/1 var(--serif); letter-spacing:.14em; }
.new-thread { display:flex; align-items:center; gap:8px; background:var(--accent); color:#fff; border-radius:10px; padding:9px 14px; font-weight:500; font-size:13.5px; transition:background 120ms var(--ease); box-shadow:var(--shadow-sm); }
.new-thread:hover { background:var(--accent-hover); }
.new-thread .plus { font-size:15px; line-height:1; }
.nav { margin-top:10px; display:flex; flex-direction:column; gap:2px; }
.nav button { display:flex; align-items:center; gap:9px; padding:8px 10px; border-radius:8px; font-size:13.5px; color:var(--text2); text-align:left; width:100%; transition:background 120ms var(--ease), color 120ms var(--ease); }
.nav button:hover { background:var(--surface); color:var(--text); }
.nav button.active { background:var(--surface); color:var(--text); font-weight:500; box-shadow:var(--shadow-sm); }
.nav .ico { width:16px; text-align:center; flex:none; opacity:.75; }
.threads-label { margin:16px 10px 6px; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--text3); }
.threads { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:1px; min-height:0; }
.thread-item { display:flex; align-items:center; gap:6px; padding:7px 10px; border-radius:8px; font-size:13px; color:var(--text2); width:100%; text-align:left; }
.thread-item:hover { background:var(--surface); color:var(--text); }
.thread-item.active { background:var(--surface); color:var(--text); }
.thread-item .t-title { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.thread-item .t-del { opacity:0; flex:none; color:var(--text3); font-size:14px; padding:0 2px; }
.thread-item:hover .t-del { opacity:1; }
.thread-item .t-del:hover { color:var(--missing); }
.side-foot { border-top:1px solid var(--line); padding-top:10px; display:flex; flex-direction:column; gap:8px; }
.fresh-pill { display:flex; align-items:center; gap:7px; padding:7px 10px; border-radius:8px; background:var(--surface); font-size:12px; color:var(--text2); box-shadow:var(--shadow-sm); }
.fresh-pill .pct { font:500 12px var(--mono); }
.fresh-pill.ok .pct { color:var(--verified); }
.fresh-pill.warn .pct { color:var(--stale); }
.side-row { display:flex; align-items:center; justify-content:space-between; padding:0 4px; }
.provider-tag { font:400 10.5px var(--mono); color:var(--text3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:160px; }
.theme-btn { padding:5px 8px; border-radius:7px; color:var(--text2); font-size:13px; }
.theme-btn:hover { background:var(--surface); }

/* ---------- main ---------- */
.main { overflow-y:auto; min-width:0; display:flex; flex-direction:column; }
.view { width:100%; flex:1; display:flex; flex-direction:column; }
.view > * { flex:1; }

/* home */
.home { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:48px 24px; gap:0; min-height:100%; }
.home .mark { margin-bottom:18px; }
.home h1 { font:450 32px/1.25 var(--serif); text-align:center; letter-spacing:-.01em; }
.home h1 .repo { font-weight:560; }
.home .stats { margin-top:10px; font-size:13px; color:var(--text2); text-align:center; }
.home .stats .num { font-family:var(--mono); font-size:12.5px; }
.askwrap { width:100%; max-width:680px; margin-top:28px; }
.askbox { position:relative; background:var(--surface); border:1px solid var(--line); border-radius:14px; box-shadow:var(--shadow-md); transition:border-color 120ms var(--ease); }
.askbox:focus-within { border-color:var(--accent); }
.askbox textarea { width:100%; resize:none; border:none; outline:none; background:transparent; padding:16px 52px 16px 18px; font-size:15px; line-height:1.5; max-height:160px; }
.askbox textarea::placeholder { color:var(--text3); }
.ask-send { position:absolute; right:10px; bottom:10px; width:34px; height:34px; border-radius:9px; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; transition:background 120ms var(--ease), opacity 120ms; }
.ask-send:hover { background:var(--accent-hover); }
.ask-send:disabled { opacity:.35; cursor:default; }
.ask-hint { text-align:center; margin-top:10px; font-size:11.5px; color:var(--text3); }
.ask-hint kbd { font:400 10.5px var(--mono); border:1px solid var(--line); border-radius:4px; padding:1px 5px; background:var(--surface); }
.sugg { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:22px; max-width:680px; }
.sugg button { border:1px solid var(--line); background:var(--surface); border-radius:999px; padding:7px 14px; font-size:13px; color:var(--text2); transition:all 120ms var(--ease); box-shadow:var(--shadow-sm); }
.sugg button:hover { border-color:var(--accent); color:var(--accent); }
.honesty { margin-top:40px; font-size:12px; color:var(--text3); text-align:center; max-width:480px; }

/* thread */
.thread-view { max-width:800px; width:100%; margin:0 auto; padding:36px 32px 24px; display:flex; flex-direction:column; }
.turns { flex:1; }
.turn { padding:18px 0 30px; }
.turn + .turn { border-top:1px solid var(--line); }
.turn .q { font:450 22px/1.35 var(--serif); letter-spacing:-.005em; margin-bottom:14px; }
.status { display:flex; align-items:center; gap:10px; color:var(--text2); font-size:13.5px; padding:6px 0 10px; }
.status .orbs { display:inline-flex; gap:4px; }
.status .orb { width:5px; height:5px; border-radius:50%; background:var(--accent); animation:pulse 1.2s ease-in-out infinite; }
.status .orb:nth-child(2) { animation-delay:.2s; } .status .orb:nth-child(3) { animation-delay:.4s; }
@keyframes pulse { 0%,100% { opacity:.25; transform:scale(.85);} 50% { opacity:1; transform:scale(1);} }
.answer { font-size:15px; line-height:1.7; max-width:68ch; }
.answer .sent { display:inline; }
.chip { display:inline-flex; align-items:center; gap:3px; vertical-align:2px; margin:0 3px 0 2px; padding:1px 7px; border-radius:999px; font:500 10.5px var(--mono); border:1px solid color-mix(in srgb, var(--accent) 35%, var(--line)); color:var(--accent); background:var(--surface); transition:all 120ms var(--ease); }
.chip .seal-dot { width:5px; height:5px; border-radius:50%; }
.chip:hover { border-color:var(--accent); color:var(--accent); }
.chip.open { background:var(--accent-soft); border-color:var(--accent); color:var(--accent); }
.grounding { margin-top:14px; font-size:12px; color:var(--text3); display:flex; align-items:center; gap:6px; }
.grounding .g-dot { width:6px; height:6px; border-radius:50%; }
.quarantine { margin-top:12px; }
.quarantine > button { font-size:12.5px; color:var(--stale); display:flex; align-items:center; gap:6px; }
.quarantine .q-body { margin-top:8px; border-left:2px solid var(--stale); padding:4px 0 4px 12px; color:var(--text2); font-size:13.5px; }
.src-label { margin:22px 0 10px; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--text3); display:flex; align-items:center; gap:8px; }
.cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:10px; }
.card { text-align:left; background:var(--surface); border:1px solid var(--line); border-radius:11px; padding:11px 13px; transition:all 140ms var(--ease); box-shadow:var(--shadow-sm); display:flex; flex-direction:column; gap:6px; min-width:0; }
.card:hover { border-color:var(--accent); transform:translateY(-1px); box-shadow:var(--shadow-md); }
.card .c-top { display:flex; align-items:center; gap:7px; min-width:0; }
.card .c-n { flex:none; font:500 10px var(--mono); color:var(--text3); border:1px solid var(--line); border-radius:5px; padding:1px 5px; }
.card .c-file { font:500 12.5px var(--sans); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.card .c-meta { display:flex; align-items:center; gap:8px; font:400 10.5px var(--mono); color:var(--text3); min-width:0; }
.card .c-meta .c-path { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.card .c-snip { font:400 11px/1.5 var(--mono); color:var(--text2); overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.seal { display:inline-flex; align-items:center; gap:4px; font:500 10px var(--mono); }
.seal .s-dot { width:6px; height:6px; border-radius:50%; }
.seal.VERIFIED { color:var(--verified); } .seal.VERIFIED .s-dot { background:var(--verified); }
.seal.VERIFIED .s-dot::after { content:"\\2713"; color:#fff; font-size:5px; line-height:6px; display:block; text-align:center; }
.seal .s-dot { position:relative; }
.seal.STALE { color:var(--stale); } .seal.STALE .s-dot { background:var(--stale); }
.seal.OUT_OF_CORPUS, .seal.UNGROUNDED { color:var(--missing); } .seal.OUT_OF_CORPUS .s-dot, .seal.UNGROUNDED .s-dot { background:var(--missing); }
.receipt { margin-top:10px; background:var(--surface); border:1px solid var(--line); border-radius:11px; overflow:hidden; box-shadow:var(--shadow-sm); }
.receipt .r-top { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:9px 14px; border-bottom:1px dashed var(--line); font:400 11.5px var(--mono); }
.receipt .r-file { color:var(--accent); font-weight:500; }
.receipt .r-hash { margin-left:auto; color:var(--text3); }
.receipt pre { overflow-x:auto; padding:10px 0; background:var(--subtle); }
.rline { display:flex; font:400 12px/1.55 var(--mono); }
.rline .ln { flex:none; width:50px; text-align:right; padding-right:12px; color:var(--text3); user-select:none; }
.rline .code { white-space:pre; padding-right:16px; color:var(--text2); }
.followup { position:sticky; bottom:0; padding:14px 0 22px; background:linear-gradient(transparent, var(--bg) 34%); }

/* library */
.lib { display:grid; grid-template-columns:280px 1fr; gap:0; min-height:100%; }
.lib-rail { border-right:1px solid var(--line); padding:22px 10px 60px; overflow-y:auto; }
.lib-main { padding:30px 36px 80px; overflow-y:auto; min-width:0; }
.lib-banner { display:flex; align-items:center; gap:10px; background:var(--surface); border:1px solid var(--line); border-radius:11px; padding:11px 16px; margin-bottom:22px; font-size:13px; color:var(--text2); box-shadow:var(--shadow-sm); }
.lib-banner .pct { font:500 13px var(--mono); }
.trow { display:flex; align-items:center; gap:7px; width:100%; text-align:left; padding:5px 9px; border-radius:7px; font:400 12.5px var(--mono); color:var(--text2); }
.trow:hover { background:var(--subtle); color:var(--text); }
.trow.active { background:var(--accent-soft); color:var(--text); }
.trow .caret { width:10px; font-size:8px; color:var(--text3); flex:none; transition:transform 120ms var(--ease); }
.trow.open .caret { transform:rotate(90deg); }
.trow .dot { width:6px; height:6px; border-radius:50%; flex:none; }
.tkids { margin-left:13px; border-left:1px solid var(--line); padding-left:5px; }
.node-h { font:450 24px/1.3 var(--serif); margin-bottom:4px; }
.node-sub { color:var(--text2); font-size:12.5px; margin-bottom:20px; display:flex; gap:10px; align-items:center; }
.claims { display:flex; flex-direction:column; gap:8px; }
.claim { background:var(--surface); border:1px solid var(--line); border-radius:11px; box-shadow:var(--shadow-sm); }
.claim > button { display:flex; align-items:flex-start; gap:10px; width:100%; text-align:left; padding:12px 15px; }
.claim > button:hover { background:var(--subtle); border-radius:11px; }
.claim .cl-text { flex:1; font-size:13.5px; line-height:1.55; }
.claim .fl { flex:none; font:400 10px var(--mono); color:var(--text3); border:1px dashed var(--line); border-radius:5px; padding:1px 6px; margin-top:2px; }
.claim .fl.unsupported { color:var(--missing); border-color:var(--missing); }
.claim .r-wrap { padding:0 12px 12px; }
.empty { padding:60px 24px; text-align:center; color:var(--text2); font-size:14px; }
.fixwrap { max-width:800px; margin:0 auto; padding:30px 32px 80px; }
.fix-intro { color:var(--text2); font-size:13.5px; max-width:68ch; margin:6px 0 20px; }
.fixcard { background:var(--surface); border:1px solid var(--line); border-radius:11px; box-shadow:var(--shadow-sm); margin-bottom:10px; display:flex; gap:12px; align-items:flex-start; padding:13px 16px; }
.fixcard .sev { flex:none; margin-top:2px; font:500 10px var(--mono); padding:1px 8px; border-radius:999px; border:1px solid var(--line); color:var(--text3); }
.fixcard .sev.s1 { color:var(--missing); border-color:color-mix(in srgb, var(--missing) 45%, transparent); }
.fixcard .sev.s2 { color:var(--stale); border-color:color-mix(in srgb, var(--stale) 45%, transparent); }
.fixcard .body { flex:1; min-width:0; }
.fixcard .t { font:500 13.5px var(--sans); overflow-wrap:anywhere; }
.fixcard .d { font-size:12.5px; color:var(--text2); margin-top:2px; overflow-wrap:anywhere; }
.fixcard .m { font:400 10.5px var(--mono); color:var(--text3); margin-top:5px; }
.fixcard .copy { flex:none; padding:6px 12px; border:1px solid var(--line); border-radius:7px; font-size:12px; color:var(--accent); white-space:nowrap; }
.fixcard .copy:hover { border-color:var(--accent); }
.empty .cmd { display:inline-block; margin-top:14px; font:400 13px var(--mono); background:var(--surface); border:1px solid var(--line); padding:8px 14px; border-radius:9px; }
.errbox { margin:10px 0; border:1px solid var(--missing); border-radius:10px; padding:10px 14px; color:var(--missing); font-size:13px; }

@media (max-width:900px) {
  .shell { grid-template-columns:1fr; }
  .side { position:fixed; inset:0 30% 0 0; z-index:30; transform:translateX(-100%); transition:transform 240ms var(--ease); }
  .side.open { transform:none; box-shadow:var(--shadow-md); }
  .topbar { display:flex !important; }
  .lib { grid-template-columns:1fr; } .lib-rail { display:none; }
  .thread-view { padding:24px 18px 120px; }
}
.topbar { display:none; align-items:center; gap:10px; padding:12px 16px; border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--bg); z-index:10; }
.topbar button { border:1px solid var(--line); border-radius:8px; padding:5px 11px; font-size:12.5px; color:var(--text2); }
</style>
</head>
<body>
<div class="shell">
  <aside class="side" id="side">
    <div class="brand">
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <circle cx="11" cy="8" r="5.2" stroke="var(--accent)" stroke-width="1.5"/>
        <circle cx="6.6" cy="11.4" r="4" stroke="var(--text3)" stroke-width="1.2" opacity=".8"/>
        <circle cx="15.4" cy="11.4" r="4" stroke="var(--text3)" stroke-width="1.2" opacity=".5"/>
        <path d="M11 13v6" stroke="var(--text3)" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span class="word">OVERSTORY</span>
    </div>
    <button class="new-thread" id="newThread"><span class="plus">+</span> New thread</button>
    <div class="nav">
      <button id="navAsk" class="active"><span class="ico">&#9906;</span> Ask</button>
      <button id="navLib"><span class="ico">&#10514;</span> Library</button>
      <button id="navFix"><span class="ico">&#9998;</span> Fixes</button>
    </div>
    <div class="threads-label">Threads</div>
    <nav class="threads" id="threadList" aria-label="Threads"></nav>
    <div class="side-foot">
      <div class="fresh-pill" id="freshPill"><span class="pct" id="freshPct">…</span><span id="freshLabel">loading</span></div>
      <div class="side-row">
        <span class="provider-tag" id="providerTag"></span>
        <button class="theme-btn" id="themeBtn" title="Toggle theme" aria-label="Toggle theme">&#9789;</button>
      </div>
    </div>
  </aside>
  <main class="main" id="main">
    <div class="topbar"><button id="menuBtn">Menu</button><span style="font:560 13px var(--serif); letter-spacing:.12em;">OVERSTORY</span></div>
    <div class="view" id="view"></div>
  </main>
</div>
<script>
(function () {
  'use strict';
  var state = { overview: null, threads: [], view: 'home', thread: null, streaming: false, treeData: null, libNode: null, libOpen: {} };
  // Never round a partly-stale tree up to 100: mirrors freshnessPct() in src/core/gate.ts.
  function freshPct(f) { return f >= 1 ? 100 : Math.min(99, Math.floor(f * 100)); }
  var SEAL_WORD = { VERIFIED: 'verified', STALE: 'stale', OUT_OF_CORPUS: 'missing', UNGROUNDED: 'ungrounded' };
  var SEAL_TITLE = {
    VERIFIED: 'Receipt checked: the cited lines exist and are unchanged.',
    STALE: 'The cited evidence changed since the tree was built.',
    OUT_OF_CORPUS: 'The citation no longer resolves.',
    UNGROUNDED: 'No valid citation.'
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function fetchJson(url, opts) { return fetch(url, opts).then(function (r) { return r.json(); }); }

  /* theme */
  var savedTheme = localStorage.getItem('overstory-theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.setAttribute('data-theme', 'dark');
  function themeGlyph() {
    document.getElementById('themeBtn').innerHTML = document.documentElement.getAttribute('data-theme') === 'dark' ? '&#9788;' : '&#9789;';
  }
  document.getElementById('themeBtn').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('overstory-theme', next);
    themeGlyph();
  });
  themeGlyph();

  /* boot */
  function boot() {
    fetchJson('/api/overview').then(function (o) {
      state.overview = o;
      renderSidebarMeta();
      render();
    }).catch(function () { state.overview = { error: true }; render(); });
    refreshThreads();
  }
  function refreshThreads() {
    fetchJson('/api/threads').then(function (list) { state.threads = list; renderThreadList(); });
  }

  function renderSidebarMeta() {
    var o = state.overview;
    if (!o || o.error) return;
    var pct = freshPct(o.freshness);
    var pill = document.getElementById('freshPill');
    pill.classList.toggle('ok', pct === 100);
    pill.classList.toggle('warn', pct < 100);
    document.getElementById('freshPct').textContent = pct + '%';
    document.getElementById('freshLabel').textContent = pct === 100
      ? 'tree is current'
      : (o.total - o.verified) + ' claims out of date';
    pill.title = 'Built ' + new Date(o.builtAt).toLocaleString() + ' \\u00B7 ' + o.verified + ' of ' + o.total + ' claims verified \\u00B7 run overstory build to refresh';
    var prov = o.provider || '';
    var pretty = prov.indexOf('ollama:') === 0 ? 'Local model \\u00B7 ' + prov.slice(7)
      : prov.indexOf('anthropic:') === 0 ? 'Anthropic \\u00B7 ' + prov.slice(10)
      : 'No LLM \\u00B7 evidence only';
    document.getElementById('providerTag').textContent = pretty;
  }

  function renderThreadList() {
    var host = document.getElementById('threadList');
    host.textContent = '';
    state.threads.forEach(function (t) {
      var b = el('button', 'thread-item' + (state.thread && state.thread.id === t.id ? ' active' : ''));
      b.appendChild(el('span', 't-title', t.title));
      var del = el('span', 't-del', '\\u00D7');
      del.title = 'Delete thread';
      del.addEventListener('click', function (ev) {
        ev.stopPropagation();
        fetch('/api/thread?id=' + encodeURIComponent(t.id), { method: 'DELETE' }).then(function () {
          if (state.thread && state.thread.id === t.id) { state.thread = null; state.view = 'home'; render(); }
          refreshThreads();
        });
      });
      b.appendChild(del);
      b.addEventListener('click', function () { openThread(t.id); });
      host.appendChild(b);
    });
  }

  function openThread(id) {
    fetchJson('/api/thread?id=' + encodeURIComponent(id)).then(function (t) {
      if (t.error) return;
      state.thread = t; state.view = 'thread'; render(); renderThreadList();
    });
  }

  /* ask box factory */
  function askBox(placeholder, autofocus) {
    var wrap = el('div', 'askwrap');
    var box = el('div', 'askbox');
    var ta = document.createElement('textarea');
    ta.rows = 1; ta.placeholder = placeholder; ta.setAttribute('aria-label', placeholder);
    var send = el('button', 'ask-send');
    send.innerHTML = '&#8593;'; send.title = 'Ask'; send.setAttribute('aria-label', 'Ask');
    box.appendChild(ta); box.appendChild(send);
    wrap.appendChild(box);
    function submit() {
      var q = ta.value.trim();
      if (!q || state.streaming) return;
      ta.value = '';
      askQuestion(q);
    }
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    ta.addEventListener('input', function () {
      ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    });
    send.addEventListener('click', submit);
    if (autofocus) setTimeout(function () { ta.focus(); }, 40);
    wrap._ta = ta;
    return wrap;
  }

  /* SSE ask */
  function askQuestion(question) {
    if (!state.thread) state.thread = { id: null, title: question, turns: [] };
    state.view = 'thread';
    state.streaming = true;
    var liveTurn = { question: question, result: null, phase: { phase: 'brainstorm' }, error: null };
    state.thread.turns.push(liveTurn);
    render();

    fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: question, threadId: state.thread.id || undefined })
    }).then(function (res) {
      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var buf = '';
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) { finish(); return; }
          buf += dec.decode(r.value, { stream: true });
          var parts = buf.split('\\n\\n');
          buf = parts.pop();
          parts.forEach(function (block) {
            var evLine = block.split('\\n').find(function (l) { return l.indexOf('event: ') === 0; });
            var dataLine = block.split('\\n').find(function (l) { return l.indexOf('data: ') === 0; });
            if (!evLine || !dataLine) return;
            var ev = evLine.slice(7).trim();
            var data;
            try { data = JSON.parse(dataLine.slice(6)); } catch (e) { return; }
            if (ev === 'thread' && !state.thread.id) { state.thread.id = data.id; state.thread.title = data.title; refreshThreads(); }
            if (ev === 'phase') { liveTurn.phase = data; updateStatus(liveTurn); }
            if (ev === 'answer') { liveTurn.result = data; liveTurn.phase = null; }
            if (ev === 'error') { liveTurn.error = data.message; liveTurn.phase = null; }
          });
          return pump();
        });
      }
      function finish() { state.streaming = false; render(); refreshThreads(); }
      return pump();
    }).catch(function (err) {
      liveTurn.error = String(err); state.streaming = false; render();
    });
  }

  function phaseText(p, o) {
    if (!p) return '';
    if (p.phase === 'brainstorm') return 'Understanding the question\\u2026';
    if (p.phase === 'search') return 'Searching ' + (o ? o.total : '') + ' claims' + (p.subqueries && p.subqueries.length > 1 ? ' \\u00B7 ' + p.subqueries.slice(1).join(' \\u00B7 ') : '') + '\\u2026';
    if (p.phase === 'write') return 'Writing from ' + (p.evidenceCount || 0) + ' pieces of evidence\\u2026';
    if (p.phase === 'gate') return 'Notarizing citations against the code\\u2026';
    return '';
  }
  function updateStatus(turn) {
    var s = document.getElementById('live-status');
    if (s) s.lastChild.textContent = phaseText(turn.phase, state.overview);
  }

  /* renderers */
  function render() {
    var view = document.getElementById('view');
    view.textContent = '';
    document.getElementById('navAsk').classList.toggle('active', state.view !== 'lib' && state.view !== 'fix');
    document.getElementById('navLib').classList.toggle('active', state.view === 'lib');
    document.getElementById('navFix').classList.toggle('active', state.view === 'fix');
    if (state.overview && state.overview.error) { view.appendChild(renderNoTree()); return; }
    if (state.view === 'lib') { view.appendChild(renderLibrary()); return; }
    if (state.view === 'fix') { view.appendChild(renderFixView()); return; }
    if (state.view === 'thread' && state.thread) { view.appendChild(renderThread()); return; }
    view.appendChild(renderHome());
  }

  function renderFixView() {
    var wrap = el('div', 'fixwrap');
    if (!state.treeData) {
      fetchJson('/api/tree').then(function (d) {
        if (d.error) return;
        state.treeData = d;
        Object.keys(d.nodes).forEach(function (id) { if (d.nodes[id].kind !== 'leaf') state.libOpen[id] = true; });
        render();
      });
      wrap.appendChild(el('div', 'empty', 'Scanning the tree\\u2026'));
      return wrap;
    }
    var findings = state.treeData.findings || [];
    wrap.appendChild(el('h2', 'node-h', 'Fix prompts'));
    wrap.appendChild(el('div', 'fix-intro', 'Paste-ready prompts for your coding agent, generated from the verified tree. Each is grounded in receipts, scoped to one bounded change, and ends with machine-checkable acceptance criteria \\u2014 including rebuilding this tree to prove the fix landed. One prompt per session; smallest diff wins.'));
    if (!findings.length) { wrap.appendChild(el('div', 'empty', 'No findings \\u2014 clean by every deterministic check.')); return wrap; }
    var sevWord = { 1: 'fix first', 2: 'soon', 3: 'later' };
    findings.forEach(function (f) {
      var card = el('div', 'fixcard');
      card.appendChild(el('span', 'sev s' + f.severity, sevWord[f.severity]));
      var body = el('div', 'body');
      body.appendChild(el('div', 't', f.title));
      body.appendChild(el('div', 'd', f.detail));
      body.appendChild(el('div', 'm', f.kind + ' \\u00B7 ' + f.receipts + ' receipt' + (f.receipts === 1 ? '' : 's')));
      card.appendChild(body);
      var copy = el('button', 'copy', 'Copy prompt');
      copy.addEventListener('click', function () {
        navigator.clipboard.writeText(f.prompt).then(function () {
          copy.textContent = 'Copied \\u2713';
          setTimeout(function () { copy.textContent = 'Copy prompt'; }, 1500);
        });
      });
      card.appendChild(copy);
      wrap.appendChild(card);
    });
    return wrap;
  }

  function renderNoTree() {
    var box = el('div', 'empty');
    box.appendChild(el('div', '', 'No knowledge tree yet for this folder.'));
    box.appendChild(el('div', 'cmd', 'npx @northtek/overstory build'));
    box.appendChild(el('div', '', 'Then refresh this page.')).style.marginTop = '10px';
    return box;
  }

  function renderHome() {
    var o = state.overview;
    var home = el('div', 'home');
    var mark = el('div', 'mark');
    mark.innerHTML = '<svg width="34" height="34" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="8" r="5.2" stroke="var(--accent)" stroke-width="1.4"/><circle cx="6.6" cy="11.4" r="4" stroke="var(--text3)" stroke-width="1.1" opacity=".7"/><circle cx="15.4" cy="11.4" r="4" stroke="var(--text3)" stroke-width="1.1" opacity=".45"/><path d="M11 13v6" stroke="var(--text3)" stroke-width="1.4" stroke-linecap="round"/></svg>';
    home.appendChild(mark);
    var h1 = el('h1');
    h1.appendChild(document.createTextNode('Ask '));
    h1.appendChild(el('span', 'repo', o ? o.name : 'your codebase'));
    home.appendChild(h1);
    if (o) {
      var stats = el('div', 'stats');
      stats.innerHTML = '<span class="num">' + o.verified + '</span> verified claims across <span class="num">' + o.nodes + '</span> nodes \\u00B7 every answer cites lines you can check';
      home.appendChild(stats);
    }
    var ab = askBox('Ask about this codebase\\u2026', true);
    home.appendChild(ab);
    var hint = el('div', 'ask-hint');
    hint.innerHTML = '<kbd>/</kbd> to focus \\u00B7 <kbd>Enter</kbd> to ask \\u00B7 answers are notarized, not just generated';
    ab.appendChild(hint);
    if (o && o.suggestions) {
      var sg = el('div', 'sugg');
      o.suggestions.forEach(function (s) {
        var b = el('button', '', s);
        b.addEventListener('click', function () { askQuestion(s); });
        sg.appendChild(b);
      });
      home.appendChild(sg);
    }
    home.appendChild(el('div', 'honesty', 'Every citation is checked against the code, not just displayed. Statements without verifiable evidence are withheld and say so.'));
    return home;
  }

  function renderThread() {
    var wrap = el('div', 'thread-view');
    var turns = el('div', 'turns');
    state.thread.turns.forEach(function (turn, i) {
      turns.appendChild(renderTurn(turn, i === state.thread.turns.length - 1));
    });
    wrap.appendChild(turns);
    var fu = el('div', 'followup');
    fu.appendChild(askBox('Ask a follow-up\\u2026', !state.streaming));
    wrap.appendChild(fu);
    return wrap;
  }

  function renderTurn(turn, isLast) {
    var t = el('div', 'turn');
    t.appendChild(el('div', 'q', turn.question));
    if (turn.phase) {
      var st = el('div', 'status');
      st.id = 'live-status';
      var orbs = el('span', 'orbs');
      orbs.appendChild(el('span', 'orb')); orbs.appendChild(el('span', 'orb')); orbs.appendChild(el('span', 'orb'));
      st.appendChild(orbs);
      st.appendChild(document.createTextNode(phaseText(turn.phase, state.overview)));
      t.appendChild(st);
      return t;
    }
    if (turn.error) { t.appendChild(el('div', 'errbox', turn.error)); return t; }
    var r = turn.result;
    if (!r) return t;

    var evidenceByClaim = {};
    (r.evidence || []).forEach(function (e) { evidenceByClaim[e.claimId] = e; });
    var citedIds = [];
    (r.sentences || []).forEach(function (s) {
      (s.refs || []).forEach(function (ref) { if (citedIds.indexOf(ref) < 0) citedIds.push(ref); });
    });

    if (!r.sentences || !r.sentences.length) {
      var none = el('div', '');
      none.style.cssText = 'border:1px solid var(--line);border-radius:11px;padding:14px 16px;background:var(--surface);font-size:13.5px;color:var(--text2);box-shadow:var(--shadow-sm)';
      none.textContent = 'The tree\\u2019s evidence couldn\\u2019t support a verifiable answer to this question. Try rephrasing, or browse the Library to see what the tree knows.';
      t.appendChild(none);
    }
    var ans = el('div', 'answer');
    (r.sentences || []).forEach(function (s) {
      var span = el('span', 'sent', s.text + ' ');
      ans.appendChild(span);
      (s.refs || []).forEach(function (ref) {
        var n = citedIds.indexOf(ref) + 1;
        var ev = evidenceByClaim[ref];
        var chip = el('button', 'chip');
        chip.appendChild(document.createTextNode(String(n)));
        var dot = el('span', 'seal-dot');
        dot.style.background = 'var(--' + (s.verdict === 'VERIFIED' ? 'verified' : s.verdict === 'STALE' ? 'stale' : 'missing') + ')';
        chip.appendChild(dot);
        chip.title = (ev ? ev.text + ' \\u2014 ' : '') + SEAL_TITLE[s.verdict];
        chip.addEventListener('click', function () { toggleReceiptCard(t, ref, chip); });
        ans.appendChild(chip);
      });
    });
    t.appendChild(ans);

    if (r.sentences && r.sentences.length) {
      var g = el('div', 'grounding');
      var gd = el('span', 'g-dot');
      var pct = Math.round((r.grounding || 0) * 100);
      gd.style.background = pct === 100 ? 'var(--verified)' : pct >= 50 ? 'var(--stale)' : 'var(--missing)';
      g.appendChild(gd);
      g.appendChild(document.createTextNode('Grounded ' + pct + '% \\u00B7 mode: ' + r.mode + ' \\u00B7 every chip opens its receipt'));
      t.appendChild(g);
    }

    if (r.unverifiable && r.unverifiable.length) {
      var qr = el('div', 'quarantine');
      var qb = el('button', '', '\\u25B8 ' + r.unverifiable.length + ' statement' + (r.unverifiable.length === 1 ? '' : 's') + ' withheld (no verifiable citation)');
      var qbody = el('div', 'q-body');
      qbody.hidden = true;
      r.unverifiable.forEach(function (u) { qbody.appendChild(el('div', '', u)); });
      qb.addEventListener('click', function () { qbody.hidden = !qbody.hidden; });
      qr.appendChild(qb); qr.appendChild(qbody);
      t.appendChild(qr);
    }

    if (citedIds.length) {
      var lbl = el('div', 'src-label');
      lbl.appendChild(document.createTextNode('Receipts'));
      lbl.appendChild(el('span', '', '\\u00B7 ' + citedIds.length));
      t.appendChild(lbl);
      var cards = el('div', 'cards');
      citedIds.forEach(function (ref, idx) {
        var ev = evidenceByClaim[ref];
        if (!ev) return;
        var card = el('button', 'card');
        card.setAttribute('data-ref', ref);
        var top = el('div', 'c-top');
        top.appendChild(el('span', 'c-n', String(idx + 1)));
        var fileName = (ev.spans && ev.spans[0]) ? ev.spans[0].file.split('/').pop() : ev.nodePath || 'roll-up claim';
        top.appendChild(el('span', 'c-file', fileName));
        card.appendChild(top);
        var meta = el('div', 'c-meta');
        var seal = el('span', 'seal ' + (ev.verdict || 'VERIFIED'));
        seal.appendChild(el('span', 's-dot'));
        seal.appendChild(document.createTextNode(SEAL_WORD[ev.verdict] || 'verified'));
        seal.title = SEAL_TITLE[ev.verdict] || '';
        meta.appendChild(seal);
        if (ev.spans && ev.spans[0]) {
          var pathEl = el('span', 'c-path', ev.spans[0].file + ':' + ev.spans[0].startLine + '-' + ev.spans[0].endLine);
          pathEl.title = ev.spans[0].file + ':' + ev.spans[0].startLine + '-' + ev.spans[0].endLine;
          meta.appendChild(pathEl);
        }
        card.appendChild(meta);
        card.appendChild(el('div', 'c-snip', ev.text));
        card.addEventListener('click', function () { toggleReceiptCard(t, ref, card); });
        cards.appendChild(card);
      });
      t.appendChild(cards);
      var rslot = el('div', 'r-slot');
      rslot.id = 'rslot-' + Math.random().toString(36).slice(2, 8);
      t.appendChild(rslot);
      t._evidence = evidenceByClaim;
      t._rslot = rslot;
    }
    return t;
  }

  function toggleReceiptCard(turnEl, ref, trigger) {
    var slot = turnEl._rslot;
    if (!slot) return;
    var openRef = slot.getAttribute('data-open');
    turnEl.querySelectorAll('.chip.open').forEach(function (c) { c.classList.remove('open'); });
    if (openRef === ref) { slot.textContent = ''; slot.removeAttribute('data-open'); return; }
    var ev = turnEl._evidence[ref];
    if (!ev) return;
    slot.textContent = '';
    slot.setAttribute('data-open', ref);
    if (trigger.classList.contains('chip')) trigger.classList.add('open');
    slot.appendChild(receiptEl(ev));
    slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function receiptEl(ev) {
    var box = el('div', 'receipt');
    (ev.spans || []).forEach(function (span) {
      var top = el('div', 'r-top');
      top.appendChild(el('span', 'r-file', span.file + ':' + span.startLine + '-' + span.endLine));
      var seal = el('span', 'seal ' + (ev.verdict || 'VERIFIED'));
      seal.appendChild(el('span', 's-dot'));
      seal.appendChild(document.createTextNode(SEAL_WORD[ev.verdict] || 'verified'));
      top.appendChild(seal);
      if (span.hash) top.appendChild(el('span', 'r-hash', 'sha256 ' + String(span.hash).slice(0, 12)));
      box.appendChild(top);
      var pre = el('pre');
      String(span.text).split('\\n').forEach(function (line, i) {
        var lr = el('div', 'rline');
        lr.appendChild(el('span', 'ln', String(span.startLine + i)));
        lr.appendChild(el('span', 'code', line === '' ? ' ' : line));
        pre.appendChild(lr);
      });
      box.appendChild(pre);
    });
    if (!ev.spans || !ev.spans.length) {
      var top2 = el('div', 'r-top');
      top2.appendChild(el('span', 'r-file', ev.nodePath || 'tree claim'));
      box.appendChild(top2);
      var body = el('div', '');
      body.style.cssText = 'padding:10px 14px;font-size:13px;color:var(--text2)';
      body.textContent = 'Grounded in tree claim: "' + ev.text + '" \\u2014 open the Library to descend to its source lines.';
      box.appendChild(body);
    }
    return box;
  }

  /* library */
  function renderLibrary() {
    var lib = el('div', 'lib');
    var rail = el('div', 'lib-rail');
    var main = el('div', 'lib-main');
    lib.appendChild(rail); lib.appendChild(main);
    if (!state.treeData) {
      fetchJson('/api/tree').then(function (d) {
        if (d.error) return;
        state.treeData = d;
        state.libNode = state.libNode || d.root;
        Object.keys(d.nodes).forEach(function (id) {
          if (d.nodes[id].kind !== 'leaf') state.libOpen[id] = true; // populated by default, never two lonely rows
        });
        render();
      });
      main.appendChild(el('div', 'empty', 'Loading the tree\\u2026'));
      return lib;
    }
    var d = state.treeData;
    rail.appendChild(treeNodeEl(d.root));

    var node = d.nodes[state.libNode] || d.nodes[d.root];
    var pct = freshPct(d.freshness);
    var banner = el('div', 'lib-banner');
    var bp = el('span', 'pct', pct + '%');
    bp.style.color = pct === 100 ? 'var(--verified)' : 'var(--stale)';
    banner.appendChild(bp);
    banner.appendChild(document.createTextNode(
      (pct === 100 ? 'Every claim verified against the code' : (d.total - d.verified) + ' of ' + d.total + ' claims need attention') +
      ' \\u00B7 built ' + new Date(d.builtAt).toLocaleString() +
      ' \\u00B7 verified = receipt checked \\u00B7 unchecked = awaiting semantic critique'
    ));
    main.appendChild(banner);
    main.appendChild(el('h2', 'node-h', node.kind === 'root' ? node.title : node.title));
    var sub = el('div', 'node-sub');
    sub.appendChild(el('span', '', node.kind + (node.path ? ' \\u00B7 ' + node.path : '')));
    sub.appendChild(el('span', '', node.verified + ' of ' + node.total + ' verified in this subtree'));
    main.appendChild(sub);
    var claims = el('div', 'claims');
    if (!node.claims.length) claims.appendChild(el('div', 'empty', 'No claims for this node.'));
    node.claims.forEach(function (c) {
      var cl = el('div', 'claim');
      var row = el('button', '');
      var seal = el('span', 'seal ' + c.verdict);
      seal.appendChild(el('span', 's-dot'));
      seal.appendChild(document.createTextNode(SEAL_WORD[c.verdict]));
      seal.title = SEAL_TITLE[c.verdict];
      row.appendChild(seal);
      row.appendChild(el('span', 'cl-text', c.text));
      if (c.faithfulness === 'unsupported') { var f = el('span', 'fl unsupported', 'flagged'); f.title = 'The build-time critique judged the cited lines do not support this claim.'; row.appendChild(f); }
      else if (c.faithfulness === 'unchecked') { var f2 = el('span', 'fl', 'unchecked'); f2.title = 'No semantic critique ran for this claim.'; row.appendChild(f2); }
      var rwrap = el('div', 'r-wrap');
      rwrap.hidden = true;
      row.addEventListener('click', function () {
        if (rwrap.hidden && !rwrap.firstChild) {
          rwrap.appendChild(receiptEl({ spans: c.spans, verdict: c.verdict, text: c.text, nodePath: node.path }));
          (c.refs || []).forEach(function (ref) {
            var target = state.treeData.nodes[ref.nodeId];
            if (!target) return;
            var line = el('button', '');
            line.style.cssText = 'display:block;margin-top:6px;font:400 12px var(--mono);color:var(--accent);';
            line.textContent = '\\u2192 grounded in ' + (target.path || target.title);
            line.addEventListener('click', function (evn) { evn.stopPropagation(); state.libNode = ref.nodeId; render(); });
            rwrap.appendChild(line);
          });
        }
        rwrap.hidden = !rwrap.hidden;
      });
      cl.appendChild(row); cl.appendChild(rwrap);
      claims.appendChild(cl);
    });
    main.appendChild(claims);
    return lib;
  }

  function treeNodeEl(id) {
    var d = state.treeData;
    var node = d.nodes[id];
    var wrap = el('div', '');
    var hasKids = node.childIds.length > 0;
    var row = el('button', 'trow' + (state.libNode === id ? ' active' : '') + (state.libOpen[id] ? ' open' : ''));
    row.appendChild(el('span', 'caret', hasKids ? '\\u25B6' : ''));
    var dot = el('span', 'dot');
    dot.style.background = node.worst === 'VERIFIED' ? 'var(--verified)' : node.worst === 'STALE' ? 'var(--stale)' : 'var(--missing)';
    row.appendChild(dot);
    row.appendChild(el('span', '', node.kind === 'root' ? node.title : node.title + (node.kind === 'dir' ? '/' : '')));
    row.title = node.verified + ' of ' + node.total + ' claims verified in this subtree';
    row.addEventListener('click', function () {
      if (hasKids) state.libOpen[id] = !state.libOpen[id];
      state.libNode = id;
      render();
    });
    wrap.appendChild(row);
    if (hasKids && state.libOpen[id]) {
      var kids = el('div', 'tkids');
      node.childIds.forEach(function (cid) { kids.appendChild(treeNodeEl(cid)); });
      wrap.appendChild(kids);
    }
    return wrap;
  }

  /* nav + shortcuts */
  document.getElementById('newThread').addEventListener('click', function () {
    state.thread = null; state.view = 'home'; render(); renderThreadList();
  });
  document.getElementById('navAsk').addEventListener('click', function () {
    state.view = state.thread ? 'thread' : 'home'; render();
  });
  document.getElementById('navLib').addEventListener('click', function () { state.view = 'lib'; render(); });
  document.getElementById('navFix').addEventListener('click', function () { state.view = 'fix'; render(); });
  document.getElementById('menuBtn') && document.getElementById('menuBtn').addEventListener('click', function () {
    document.getElementById('side').classList.toggle('open');
  });
  document.addEventListener('keydown', function (e) {
    var tag = document.activeElement && document.activeElement.tagName;
    if ((e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) && tag !== 'TEXTAREA' && tag !== 'INPUT') {
      e.preventDefault();
      var ta = document.querySelector('.askbox textarea');
      if (ta) ta.focus();
      else { state.view = state.thread ? 'thread' : 'home'; render(); }
    }
  });

  boot();
})();
</script>
</body>
</html>
`;
