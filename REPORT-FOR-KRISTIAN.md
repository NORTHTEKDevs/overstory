# OVERSTORY — Autonomous Build Report

## v3 addendum (2026-07-21): the hosted registry — LIVE

Your ask ("connect to GitHub, upload local codebase, it verifies it") shipped as a **verified
registry**, deployed and public:

- **Live now:** https://overstory-pacy5uhfg-kristians-projects-6e13f870.vercel.app (project
  `overstory` on your Vercel; overstory.northtek.io attached + verified, DNS propagating).
- **Paste a repo → instant tree:** server fetches the GitHub tarball, builds a deterministic
  extractive tree, runs the gate, serves the explorer — measured 1.4-1.7s for real repos
  (factgate, genome), zero LLM, zero per-request cost beyond the function.
- **`overstory publish`:** uploads your locally-built rich tree; the server independently
  re-fetches the repo and re-runs the gate — **100% verified or rejected with the failing
  receipts named**. No auth needed: you cannot publish lies about code, so identity doesn't
  gate truth. No raw code is ever uploaded — only trees (cited spans of already-public code).
- **Live README badge** (`/badge/gh/OWNER/REPO.svg`): recomputed from the actual gate against
  the live repo, decays honestly. The viral loop.
- **Architecture call (flagging per protocol):** the server never runs an LLM — building
  needs a model, verifying is hashing. That keeps it ~$0 on Vercel+Neon, no new vendors, and
  preserves the privacy moat (DeepWiki-style cloud builds for private repos = the documented
  PAID tier, not v1). 115/115 tests incl. the registry trust suite (tampered trees rejected
  by name, wrong-repo trees rejected, freshness decay honest). drizzle-orm patched for
  GHSA-gpj5 (SQL-identifier injection); remaining npm-audit moderate is a dev-time
  postcss-via-next path, noted not hidden.

**Two things need you:**
1. **Neon OAuth** — a neonctl browser window is waiting for approval on your machine. Approve
   it and tell me (or run: `npx neonctl projects create --name overstory-registry`, then
   `psql "$DATABASE_URL" -f web/schema.sql`, add DATABASE_URL to the Vercel project, redeploy).
   Until then the registry runs stateless: instant trees + badges work; publish honestly 503s.
2. Same two as before: flip the repo public + `npm publish` (the CLI's publish command points
   at overstory.northtek.io and is ready the moment both land).

## v2 addendum (2026-07-20): the frontier-lab app

You rejected the v1 dark operator-console UI and asked for Perplexity/ChatGPT-class product
quality. Shipped same day, `overstory serve`:

- **Ask-first local app** at http://127.0.0.1:7433 (running now): centered ask hero with
  grounded suggested questions, SSE-streamed phases ("Searching 178 claims… → Notarizing
  citations…"), answers with numbered citation chips carrying verdict dots, Perplexity-style
  receipt cards that unfold inline into the exact cited lines + sha256 + seal, quarantine
  expander for withheld statements, thread history (persisted to .overstory/threads.json),
  library view, paper-light + true dark themes, full keyboard path. Zero new dependencies.
- **Live-bug found & fixed by using it:** qwen cited long claim-IDs sloppily → entire answers
  quarantined. Fix: numbered evidence refs ([1]-style, the Perplexity approach) with
  server-side mapping — first live ask after the fix: real answer, 5/5 receipts, Grounded 100%.
- **Design gate v2:** 3-judge panel average **8.37 PASS** (A 8.36 / B 7.90 / C 8.85); all of
  both judges' consensus fixes applied and screenshot-verified after (chip affordance at
  rest, colorblind ✓ on verified seals, calm sidebar voice, dead-space fixes on all three
  views, path truncation, status-legend). Consciously accepted finding, recorded not hidden:
  the shell's structural anatomy is deliberately in Perplexity's family — you asked for
  exactly that; the receipt mechanism is the differentiation. Structural departure ("trust
  strip" resting mode for receipts) is the top v3 candidate.
- Static export restyled to the same v2 system (paper-light + dark via prefers-color-scheme).
- **91/91 tests green** incl. a full serve-stack suite (SSE streaming, threads, notarize API,
  malformed-body resilience). Your taste verdict is in memory so no future session ships
  ops-console aesthetics for an AI answer product again.

---

# v1 report (2026-07-19)

You said: analyze the setup, blend BSHR / Reflexion / RAPTOR / knowledge trees / your research,
create a brand-new product as your digital twin, deep-research the field, full creative
control, ~8.5 hours. This is what happened. Everything below is evidence-backed; where
something is unverified I say so.

## What got built

**OVERSTORY** (`~/projects/active/overstory`, private repo `NORTHTEKDevs/overstory`):
a knowledge tree of any codebase or docs folder where **every claim carries a mechanically
verifiable receipt** — local-first, zero-infra, `npx`-able. It is the TypeScript synthesis of
your whole research line: FACTGATE's fail-closed gate (VERIFIED / STALE / OUT_OF_CORPUS /
UNGROUNDED), verified-memory's invariant (context in, adjudicated claims out), GENOME's RAPTOR
build — including its honest null: the tree's value is the explorable provenance artifact, not
retrieval accuracy — RAIN's Reflexion mechanics, and BSHR as the query engine.

Surfaces: CLI (`build/verify/ask/site/mcp`), an MCP server whose star tool `overstory_verify`
notarizes the HOST agent's own answers (Claude Code drafts, OVERSTORY checks the receipts —
zero API keys needed), and a single-file award-tier explorer where claims unfold into
receipts (source lines + sha256 seal). Staleness is structural: hashes over span TEXT (edits
above a span self-heal), `overstory verify` exits non-zero in CI when docs and code disagree.

## Why this product (the twin call)

Deep research (docs/research/RESEARCH.md, all cited) confirmed the gap is real and unclaimed:
"no product combines local/air-gapped deployment + packaged generative Q&A + enforced
verifiable citation." DeepWiki is cloud-only with documented hallucination incidents;
Sourcegraph's citation UI is a $16k enterprise SKU; mutable.ai died. Devil's Advocate panel
verdict on the design: PROCEED-WITH-CHANGES (all changes implemented: build concurrency +
checkpoint/resume, the adversarial semantic-mismatch control, hash-over-text made explicit).
Business posture: moat + adoption play in your GENOME/FACTGATE Apache-2.0 pattern; monetization
path documented (team trees, stale-docs CI bot) and deliberately deferred.

## Evidence (all executed this session)

- Tests: **80/80 green** (`npx vitest run`), `tsc --noEmit` clean, dist builds, `npm pack`
  clean (44 KB, 47 files).
- Gate negative controls PASS: fabricated citation never VERIFIED; tampered span -> STALE;
  forged receipt (hash/text mismatch) -> UNGROUNDED; edit-above-span heals instead of staling;
  duplicate citations verify (not spuriously downgraded); cycles fail closed.
- Adversarial semantic-mismatch control PASS (mocked): true span + false claim exits
  `faithfulness: unsupported`, kept visible and flagged, never silently VERIFIED.
- Live E2E on OVERSTORY itself with local qwen2.5:14b (measured first: 23.7s/call warm,
  113.5s cold, JSON adherence valid): first full build 26 nodes / 136 claims / 29.3 min.
- The staleness system caught ME twice, unprompted: editing source after a build flipped the
  explorer to amber "N of M claims need attention" both times. The honest-freshness pitch
  demonstrated itself.
- Ship-gate workflow (5 reviewers + adversarial verify): **BLOCK verdict with 7 must-fix
  findings — all 7 fixed + regression-tested same session** (build lock, checkpoint-failure
  surfacing, corpusOptions persistence so MCP/CLI verify against the built scope, path-scoped
  cycle detection, NaN-proof flags, prototype-pollution guards, README local-first wording).
- Design: DESIGN.md written before UI code (evidentiary field-ledger identity; receipt-unfold
  signature). Rendered-screenshot critique loop ran; cycle-1 usability-floor miss fixed
  (receipt affordances, section-wide receipts, roll-up de-chaining, lockfile exclusion).
  Final 3-judge panel score: see FINAL NUMBERS below.

## Decisions I made without you (flagging per protocol)

1. Applied the pending design-intel doctrine proposal (springs for number tickers, guardrailed) —
   it was two-source evidenced and consistent with your accepted patterns. Queue is empty.
2. Created `NORTHTEKDevs/overstory` as **PRIVATE** and pushed (your always-push rule) — making
   it public is your call, it is one click.
3. Northtek commit identity, no Claude trailer (your public-repo rule), Apache-2.0.
4. Cut `claude -p` as an LLM provider (untested-on-this-machine code = dishonest to ship);
   documented in roadmap instead.
5. Used Workflow orchestration in-session instead of night-shift (your machine-limits feedback).
6. Brainstorming/design approvals: user-unreachable, so the Devil's Advocate panel + ship-gate +
   judge panel substituted for your approval gates, per your explicit creative-control grant.

## What needs YOU

1. **Flip the repo public** when you're happy (`gh repo edit NORTHTEKDevs/overstory --visibility public`).
2. **npm publish** needs your passkey (non-delegable): `cd ~/projects/active/overstory && npm publish --access public`
   (prepack builds dist; do NOT use --ignore-scripts).
3. Skim REPORT + README + the explorer (`.overstory/site.html`) — the demo artifact is the pitch.
4. Optional launch moves: post the "docs that know when they're lying" angle; the
   staleness-catches-me-live story writes itself.

## Honest limitations (v1, documented in README/roadmap)

Interior-node claims are not critique-checked (marked `unchecked` — honest, visible); heal
anchors to first byte-identical occurrence (deliberate: identical text = identical evidence);
extractive mode's claims are shallow ("Declares X") by design; local-model builds are slow
(~90s/file with critique on this machine); mobile rendering verified by CSS defensiveness,
not device screenshots. Anthropic-provider path is mock-tested only (no API key on this box).

## FINAL NUMBERS

- **Design ship gate: PASS at 8.12 / 10** (threshold 8.0, product-UI class). Panel of 3
  independent judges: 8.86 / 7.20 / 8.31; all floors met (Usability 8.34, Creativity 8.17).
  Spread 1.66 logged — the disagreement axis: whether the resting ledger rows carry the
  field-ledger identity or only the unfolded receipt does. Remaining gaps recorded, not hidden:
  (1) wrapped claim rows break the declared 48px rhythm (line-clamp fix), (2) resting rows
  could carry a receipt cue (mono hash sliver), (3) the amber freshness stat reads alarm-weight
  vs the declared "calm", (4) dead space below short claim lists at low-claim nodes,
  (5) `unchecked` chip styling collides with the verdict-chip taxonomy. All are surgical
  post-v1 polish; halted at threshold per loop rules.
- **Final demo build: 100% freshness — 178 of 178 claims VERIFIED** (26 nodes, from-scratch
  local qwen2.5:14b build, 32 min, `overstory verify` exit 0). 55 leaf claims semantically
  `supported` by the live critique, 0 `unsupported`, 98 honestly `unchecked` (1-round budget);
  44 of the 178 claims were ADDED by the critic as missing facts. Artifact: `.overstory/site.html`.
- **Live semantic probe: PASS, actively** — seeded false claim over real unchanged lines:
  mechanical gate VERIFIED (correct — the lines exist), live critique flagged it
  `unsupported`; the paired true claim came back `supported`. This probe also exposed and
  killed a real bug first (zod `.optional()` rejecting qwen's explicit `null`s had silently
  disabled the whole critique tier — mocked tests could never catch it; now a captured-shape
  regression test + a memory lesson).
- Final state: **83/83 tests green, tsc clean, all commits pushed** to private
  NORTHTEKDevs/overstory.
