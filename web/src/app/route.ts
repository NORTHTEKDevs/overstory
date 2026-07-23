export const runtime = 'nodejs';

const LANDING = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OVERSTORY — verified knowledge trees for codebases</title>
<meta name="description" content="Paste a GitHub repo. Get an explorable map where every claim cites lines you can check — verified against the code, not just displayed.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,450;9..144,560&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--bg:#FAF9F5;--surface:#FFFFFF;--subtle:#F1EFE9;--line:#E4E1D8;--text:#1A1D1B;--text2:#5C6660;--text3:#98A19A;--accent:#1F7A5C;--accent-hover:#196349;--accent-soft:rgba(31,122,92,.09);--stale:#B8860B;
--serif:"Fraunces",Georgia,serif;--sans:"Inter",system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace;--shadow:0 1px 3px rgba(20,24,22,.08),0 4px 16px rgba(20,24,22,.05)}
@media (prefers-color-scheme:dark){:root{--bg:#101312;--surface:#171B19;--subtle:#1D2220;--line:#2A302C;--text:#F0F2EF;--text2:#A3ACA5;--text3:#6E7770;--accent:#34A47C;--accent-hover:#3FB98D;--accent-soft:rgba(52,164,124,.14);--shadow:none}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font:400 15px/1.6 var(--sans)}
a{color:var(--accent);text-decoration:none}
.wrap{max-width:880px;margin:0 auto;padding:0 24px}
header{display:flex;align-items:center;gap:10px;padding:20px 0}
.word{font:560 15px/1 var(--serif);letter-spacing:.14em}
header .right{margin-left:auto;display:flex;gap:18px;font-size:13px}
header .right a{color:var(--text2)}
header .right a:hover{color:var(--accent)}
.hero{text-align:center;padding:72px 0 26px}
.hero h1{font:450 44px/1.18 var(--serif);letter-spacing:-.015em;max-width:640px;margin:0 auto}
.hero h1 em{font-style:normal;color:var(--accent)}
.hero p{margin:16px auto 0;max-width:520px;color:var(--text2)}
.ask{max-width:600px;margin:30px auto 0;position:relative}
.ask form{display:flex;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden;transition:border-color 120ms}
.ask form:focus-within{border-color:var(--accent)}
.ask input{flex:1;border:none;outline:none;background:transparent;padding:16px 18px;font:400 15px var(--mono);color:var(--text)}
.ask input::placeholder{color:var(--text3);font-family:var(--sans)}
.ask button{border:none;background:var(--accent);color:#fff;font:500 14px var(--sans);padding:0 22px;cursor:pointer}
.ask button:hover{background:var(--accent-hover)}
.examples{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px}
.examples a{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:6px 13px;font:400 12.5px var(--mono);color:var(--text2)}
.examples a:hover{border-color:var(--accent);color:var(--accent)}
.honesty{text-align:center;color:var(--text3);font-size:12px;margin-top:34px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:64px 0 0}
.step{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px;box-shadow:var(--shadow)}
.step .n{font:500 11px var(--mono);color:var(--accent);letter-spacing:.08em}
.step h3{font:450 17px/1.3 var(--serif);margin:8px 0 6px}
.step p{font-size:13px;color:var(--text2)}
.step code{font:400 11.5px var(--mono);background:var(--accent-soft);padding:2px 7px;border-radius:5px;color:var(--accent)}
.publish{margin:64px 0;background:var(--subtle);border:1px solid var(--line);border-radius:16px;padding:28px}
.publish h2{font:450 24px/1.3 var(--serif);margin-bottom:8px}
.publish p{color:var(--text2);max-width:60ch}
.publish pre{margin-top:16px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 18px;font:400 13px/1.8 var(--mono);overflow-x:auto}
.publish .badge-demo{margin-top:14px;display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text2)}
.faq{margin:64px 0 0}
.faq h2{font:450 24px/1.3 var(--serif);margin-bottom:16px}
.faq details{border:1px solid var(--line);border-radius:10px;background:var(--surface);margin-bottom:8px;box-shadow:var(--shadow)}
.faq summary{cursor:pointer;padding:13px 16px;font:500 14px var(--sans);list-style:none;display:flex;align-items:center;gap:10px}
.faq summary::before{content:"▸";color:var(--accent);font-size:11px;transition:transform 120ms}
.faq details[open] summary::before{transform:rotate(90deg)}
.faq .a{padding:0 16px 14px 37px;color:var(--text2);font-size:13.5px;line-height:1.65;max-width:72ch}
footer{border-top:1px solid var(--line);margin-top:70px;padding:22px 0 40px;display:flex;gap:16px;color:var(--text3);font-size:12.5px}
footer a{color:var(--text2)}
@media (max-width:720px){.steps{grid-template-columns:1fr}.hero h1{font-size:32px}}
</style>
</head>
<body>
<div class="wrap">
<header>
  <svg width="20" height="20" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="8" r="5.2" stroke="var(--accent)" stroke-width="1.5"/><circle cx="6.6" cy="11.4" r="4" stroke="var(--text3)" stroke-width="1.2" opacity=".8"/><circle cx="15.4" cy="11.4" r="4" stroke="var(--text3)" stroke-width="1.2" opacity=".5"/><path d="M11 13v6" stroke="var(--text3)" stroke-width="1.5" stroke-linecap="round"/></svg>
  <span class="word">OVERSTORY</span>
  <nav class="right">
    <a href="https://github.com/NORTHTEKDevs/overstory">GitHub</a>
    <a href="https://www.npmjs.com/package/@northtek/overstory">npm</a>
  </nav>
</header>

<section class="hero">
  <h1>A map of any codebase where <em>every claim carries a receipt</em></h1>
  <p>Paste a public GitHub repo. Get an explorable knowledge tree in seconds — every statement cites the exact lines that support it, verified against the code, not just displayed.</p>
  <div class="ask">
    <form action="/go" method="get">
      <input name="repo" placeholder="owner/repo — try NORTHTEKDevs/overstory" aria-label="GitHub repository" autofocus>
      <button type="submit">Open tree</button>
    </form>
  </div>
  <div class="examples">
    <a href="/gh/NORTHTEKDevs/overstory">NORTHTEKDevs/overstory</a>
    <a href="/gh/NORTHTEKDevs/genome">NORTHTEKDevs/genome</a>
    <a href="/gh/NORTHTEKDevs/factgate">NORTHTEKDevs/factgate</a>
  </div>
  <p class="honesty">Instant trees are deterministic and LLM-free. The registry stores nothing — no code, no trees, no accounts. Your repo is the database; every verdict is computed fresh against your code.</p>
</section>

<section class="steps">
  <div class="step"><div class="n">01 · EXPLORE</div><h3>Paste a repo</h3><p>An instant tree, built and verified server-side from the repo's actual content. Nothing generated, nothing hallucinated — extractive claims with line receipts.</p></div>
  <div class="step"><div class="n">02 · BUILD RICH</div><h3>Build locally</h3><p>Run <code>npx @northtek/overstory build</code> with your local model or API key. Your code and your model stay on your machine.</p></div>
  <div class="step"><div class="n">03 · PUBLISH</div><h3>Publishing is a git push</h3><p>Commit <code>.overstory/tree.json</code> to your repo. The registry fetches your tree from <em>your</em> repo and verifies it against <em>your</em> code on every view — it stores nothing, ever.</p></div>
</section>

<section class="publish">
  <h2>Docs that know when they're lying</h2>
  <p>Published trees are re-verified against the live repo. When the code moves on, the freshness badge says so — in your README, honestly.</p>
  <pre>npx @northtek/overstory build       # local model or API — your choice
git add -f .overstory/tree.json     # the tree lives in YOUR repo
git commit -m "docs: overstory tree" && git push
npx @northtek/overstory publish     # confirms the registry can verify it

[![overstory](https://overstory.northtek.io/badge/gh/OWNER/REPO.svg)](https://overstory.northtek.io/gh/OWNER/REPO)</pre>
  <div class="badge-demo">
    <img src="/badge/gh/NORTHTEKDevs/overstory.svg" alt="overstory: verified badge" height="20">
    <span>← live, recomputed from the actual gate</span>
  </div>
</section>

<section class="faq">
  <h2>Honest questions, honest answers</h2>
  <details open>
    <summary>What am I actually looking at when I open a tree?</summary>
    <div class="a">A machine read the repo and wrote it up as short statements — then checked every statement against the actual code. Click any row to unfold its <b>receipt</b>: the exact lines it came from. Green means it still checks out. Amber means the code changed since it was written. That's the whole idea: nothing is taken on faith.</div>
  </details>
  <details>
    <summary>How is this different from asking ChatGPT or using an AI wiki?</summary>
    <div class="a">Those tools sound exactly as confident when they're wrong as when they're right, and their citations are displayed, not checked. Here, every citation is verified mechanically against the code — and statements that can't be verified are withheld and labeled, never blended in. When the code moves on, the page says so instead of quietly going stale.</div>
  </details>
  <details>
    <summary>Do you store my code?</summary>
    <div class="a">No — and not as a promise, as an architecture. This site has no database. Public repos are fetched from GitHub, checked in memory, and shown; nothing is kept. Published trees live in <i>your</i> repo as a file you control. Private code never touches this site at all: the full experience runs on your own machine with <code>npx @northtek/overstory serve</code>.</div>
  </details>
  <details>
    <summary>Does "verified" mean it's true?</summary>
    <div class="a">It means something precise and honest: the cited lines exist and haven't changed, checked by hashing — and every statement is one click from its evidence so you can judge it yourself. A second layer (an adversarial critique at build time) checks whether the lines actually support each statement, and statements that fail stay visible and flagged. We never claim more than we can prove — that's the product.</div>
  </details>
  <details>
    <summary>What does it cost?</summary>
    <div class="a">The tool is free and open source (Apache-2.0). This site runs no AI and stores nothing, so it's free to use. If you ask questions with your own API key, you pay your AI provider directly — typically about a cent a question. Building rich trees with a local model via Ollama costs nothing at all.</div>
  </details>
</section>

<footer>
  <span>Apache-2.0 · built on <a href="https://github.com/NORTHTEKDevs/factgate">FACTGATE</a> + <a href="https://github.com/NORTHTEKDevs/genome">GENOME</a> research</span>
  <span style="margin-left:auto">private repos never touch this server — <code style="font-family:var(--mono);font-size:11.5px">npx @northtek/overstory serve</code></span>
</footer>
</div>
</body>
</html>`;

export const GET = (): Response =>
  new Response(LANDING, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
