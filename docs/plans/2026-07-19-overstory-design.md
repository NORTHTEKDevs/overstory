# OVERSTORY — Design Document

Date: 2026-07-19
Status: DRAFT — pending deep-research reconciliation + adversarial critique (user unreachable; critique panel substitutes for approval per explicit creative-control grant)
Author: Claude (autonomous), operating as Kristian's digital twin

## The idea in one line

Turn any repo or docs folder into a living knowledge tree where **every claim carries a
mechanically verifiable receipt** — built local-first, so the code never leaves the machine.

## Why this product (the twin's reasoning)

Kristian's research portfolio converges on one invariant, proven three times in Python:

- **FACTGATE**: a deterministic gate between an LLM claim and the user. Verdicts
  VERIFIED / CONTRADICTED / OUT_OF_KB / UNRESOLVED, fail-closed, 0% false-VERIFIED across
  3,000 adversarial trials.
- **verified-memory (GENOME x FACTGATE)**: memory feeds context IN, the gate adjudicates
  claims OUT. 0/128 hard leaks in live sweeps.
- **GENOME**: RAPTOR-style hierarchical summarization (k-means -> summarize -> parent record),
  knowledge graph edges, bi-temporal beliefs. Honest published null: RAPTOR retrieval is
  accuracy-neutral at equal token budget (p=0.86).

That null is the key insight: **the tree's value is not retrieval accuracy — it is the
explorable, provenance-bearing artifact itself.** Nobody has shipped that as a product for
the corpus every developer owns: their codebase. DeepWiki-class tools (prior knowledge;
competitive lens verifying) are cloud-hosted and display citations without mechanically
verifying them. The gap is **private-by-default + receipts-by-construction + honest staleness**.

All of Kristian's implementations are Python; the npm-native surface (@northtek/genome-memory)
is a REST client needing a running server. So OVERSTORY ports the *patterns* natively to
TypeScript — zero servers, zero infra, `npx`-able. This also fits the standing constraints:
no new SaaS, zero-infra budget, existing stack only.

## Approaches considered

**A. OVERSTORY (chosen)** — local-first repo/docs -> provenance-gated knowledge tree.
CLI + MCP server + static explorer. Devs are the wedge (viral, verifiable autonomously);
docs-folder mode extends to business owners (SOPs/policies/contracts) with zero extra
architecture. Zero runtime infra; works with local Ollama = privacy story is real, not marketing.

**B. Verified deep-research engine** — BSHR web research with per-sentence receipts.
Rejected: crowded (OpenAI/Perplexity/Gemini deep research), needs paid search APIs at runtime,
weak autonomous verifiability, and Kristian already has deep-research harnesses in-house.

**C. "Company brain" for small business** — docs-only variant of A with softer UX.
Rejected as the wedge (weaker distribution: business owners don't `npx`), but preserved as
A's docs mode — same engine, different corpus.

## Architecture

### Data model (the FACTGATE port)

- **Corpus**: files walked from a root (gitignore-aware), each with sha256.
- **Chunk**: a contiguous span `{file, startLine, endLine, contentHash}`.
- **Claim**: one atomic statement `{id, text, citations: SpanRef[], verdict}`. Summaries are
  claim LISTS, not prose blobs — the unit of verification is the claim.
- **Node**: `{id, kind: leaf|dir|root, path, claims[], childIds[], contentHash, builtAt,
  freshness}`. Leaves summarize chunks; interior nodes summarize children (citations point at
  child claims, grounding out transitively in source spans).
- **Tree**: `.overstory/tree.json` + config. Hash-linked: every node records the hashes of
  what it summarized -> tamper/staleness detection is structural, not advisory.

### The gate (pure, deterministic, fail-closed)

`verifyClaim(claim, corpus) -> VERIFIED | STALE | OUT_OF_CORPUS | UNGROUNDED`

- VERIFIED: all citations resolve AND span hashes match current content.
- STALE: file exists, span hash mismatch (source changed since the claim was written).
- OUT_OF_CORPUS: cited file/span does not exist.
- UNGROUNDED: claim has no citations.

Rendering rule everywhere (site, CLI, MCP): only VERIFIED claims render unflagged. Everything
else gets a visible verdict chip. Fail-closed, like FACTGATE.

**Honesty boundary (documented, not hidden):** the gate mechanically proves *provenance and
freshness* (the cited lines exist and haven't changed). *Semantic faithfulness* (the claim is
actually supported by those lines) is enforced at build time by the Reflexion critique pass and
is auditable by clicking the receipt. We never claim the gate proves truth; we claim every
statement is one click from its evidence and self-invalidates when the evidence changes.

### Build pipeline (RAPTOR shape, BSHR discipline)

1. **Ingest**: walk, classify (code/docs/config), chunk structurally (whole file < ~400 lines;
   else split on top-level blocks / markdown headings; generic line-window fallback).
2. **Leaf summarization**: LLM provider emits claims-with-citations as strict JSON
   (schema-validated, one repair attempt, per-node fallback to extractive on repeated failure —
   a build never dies on one bad node).
3. **Reflexion refinement** (port of reflexion-loop + RAIN mechanics): per node, critique
   against the actual source — (a) mechanical: citations resolve; (b) semantic: each claim
   supported by cited lines? important exports/behaviors missing? — then revise. Stop:
   converged | max rounds (1 local / 2 API) | no-progress.
4. **Aggregate upward**: dir -> module -> root, same claim discipline.
5. **Gate sweep**: every claim verdicted; tree records freshness stats per subtree.
6. **Index**: BM25 full-text over claims + chunks. (Embeddings deferred post-v1 — YAGNI.)

### Query engine (the BSHR port)

`ask(question)`: **B**rainstorm sub-questions/keywords -> **S**earch (tree descent from root +
BM25; evidence tiered: source chunk > leaf claim > interior claim) -> **H**ypothesize (draft
answer, every sentence cited) -> **R**efine (gate every claim; failed claims dropped or
flagged; one re-search loop if the answer mostly fails). Output: answer + per-sentence receipt
chips + an overall grounding score.

### Surfaces

1. **CLI** (`npx @northtek/overstory`): `build`, `refresh`, `ask`, `verify`, `serve`, `site`.
2. **MCP server** (`overstory mcp`): tools `overstory_map` (tree overview), `overstory_search`
   (evidence retrieval), `overstory_node` (node + claims + receipts), and the differentiator —
   **`overstory_verify`**: the HOST agent (Claude Code, Cursor) submits its own drafted
   answer's claims+citations and gets per-claim verdicts back. The host LLM does the thinking;
   OVERSTORY notarizes it. Zero API keys needed for the full MCP experience.
3. **Explorer site** (`overstory site`): single self-contained HTML file (data inlined) —
   portable, shareable, no server. Award-tier per DESIGN.md (separate doc): tree nav, claim
   receipts, click-through span viewer, freshness meter, search.

### LLM provider layer (pluggable, local-first)

- `ollama` (default when reachable; qwen2.5-14B-class) — verified live on this machine.
- `anthropic` (ANTHROPIC_API_KEY): leaves on Haiku, Reflexion critique on Sonnet —
  "generate cheap, judge dear" as product architecture.
- `extractive` (no LLM): deterministic heading/signature/JSDoc extraction. Test substrate +
  graceful degrade; always available.
- `claude-code` (spawn `claude -p`): EXPERIMENTAL, mock-tested only (this machine can't
  verify live process spawning reliably); honestly labeled in README.

### Staleness (`overstory refresh`)

Rehash corpus -> changed files mark their leaves STALE -> dirty-propagate up ancestors ->
rebuild only dirty nodes. The tree is incremental by construction; freshness is a first-class
UI number. Docs that know when they're lying.

## Error handling

- Build: per-node isolation (one bad LLM response never fails the build; node falls back to
  extractive and is flagged), provider timeouts with retry-once, corpus walk skips unreadable
  files with a manifest of skips.
- Gate: pure function, no I/O at verdict time beyond the already-loaded corpus snapshot.
- CLI: non-zero exit on build failure; `--json` for scripting; clear recovery copy per doctrine.
- MCP: every tool returns structured errors; never crashes the server on a bad tree file
  (schema-validated load with a clear "rebuild needed" signal).

## Testing (machine-checkable acceptance criteria)

1. `npx tsc --noEmit` clean; full vitest suite green (captured output).
2. Gate negative controls: fabricated citation -> never VERIFIED; tampered span -> STALE;
   missing file -> OUT_OF_CORPUS; citation-free claim -> UNGROUNDED. (The FACTGATE ethos test.)
3. E2E extractive: fixture repo (~15 files) -> build -> 100% of leaf claims VERIFIED ->
   tamper one file -> refresh -> exactly the right subtree goes STALE -> rebuild -> VERIFIED.
4. Reflexion: mocked-LLM tests prove revision application + all stop conditions terminate.
5. BSHR ask: mocked-LLM test proves failed-citation claims are dropped/flagged, never shown
   as VERIFIED.
6. MCP: in-process client round-trip on all four tools; `overstory_verify` returns correct
   verdicts for a seeded true/false claim pair.
7. Site: generated single-file HTML contains inlined tree data + zero console errors on load
   (DOM-checked); design ship-gate >= 8.0 (product UI class) via design-director.
8. Live Ollama E2E on a real repo (this machine, evidence captured) — the demo artifact.

## Scope cuts (YAGNI, explicit)

Embeddings/vector search; per-symbol AST chunking (structural regex chunking is v1); watch
mode; multi-repo trees; VS Code extension; hosted anything. All noted as post-v1 candidates.

## Open items pending research reconciliation

- Competitive lens: confirm DeepWiki/Greptile gap claims; adjust positioning language.
- Computational-methods lens: local-model reliability for claim-JSON emission; if 14B-class
  JSON adherence is known-poor, promote the repair/fallback path to default-on telemetry.
- Naming: OVERSTORY (fits GENOME/RAIN/FACTGATE family). npm scope @northtek/overstory.
