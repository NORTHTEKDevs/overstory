# OVERSTORY Implementation Plan (compact — crash-recovery artifact)

Design: docs/plans/2026-07-19-overstory-design.md (LOCKED). Autonomous run 2026-07-19.
Each unit lands with tests green + tsc clean before the next integrates. Update STATUS as units land.

| # | Unit | Files | Acceptance (machine-checkable) | STATUS |
|---|------|-------|-------------------------------|--------|
| 1 | Core: hash/chunk/corpus/gate | src/core/* | 32 tests: normalization, chunk coverage/contiguity, walk excludes+skip reasons, gate negative controls incl. forged receipt + position-shift heal | DONE (commit 0cb8bc5) |
| 2 | LLM providers | src/llm/* | ollama+anthropic chat via fetch (mock-tested), provider-declared concurrency, mock provider for tests | pending |
| 3 | Leaf summarize | src/build/summarize.ts | chunk->claims JSON zod-validated; malformed JSON -> one repair retry -> extractive fallback (never fails build); extractive path deterministic, claims cite real spans | pending |
| 4 | Reflexion refine | src/build/reflexion.ts | critique marks faithfulness supported/unsupported; revisions applied; stop conditions (converged/max-rounds/no-progress) terminate; seeded false-claim (true span) exits `unsupported` (semantic-mismatch control, mocked) | pending |
| 5 | Aggregate + builder | src/build/aggregate.ts, builder.ts | dir/root claims cite child claims; checkpoint per node (atomic write); resume skips hash-matched leaves; worker pool honors provider concurrency; gate sweep attaches verdicts; E2E fixture build 100% VERIFIED -> tamper -> refresh -> exact subtree STALE -> rebuild -> VERIFIED | pending |
| 6 | BM25 + BSHR ask | src/core/bm25.ts, src/query/ask.ts | BM25 ranks exact-term hits first; ask() drops/flags gate-failing claims (mocked LLM), never shows failed claim as VERIFIED | pending |
| 7 | MCP server | src/mcp/server.ts | 4 tools (map/search/node/verify) in-process round-trip; overstory_verify returns correct verdicts for seeded true/false claim pair | pending |
| 8 | CLI | src/cli/index.ts | build/refresh/ask/verify/site/mcp commands; --json output; non-zero exit on failure | pending |
| 9 | Explorer site | src/site/* | single-file HTML, data inlined, zero console errors (DOM-checked); DESIGN.md written BEFORE UI code; design-director gate >= 8.0 | pending |
| 10 | Live demo + evidence | demo on overstory repo itself (ollama, size-gated) | tree built, freshness reported, seeded false claim outcome captured honestly | pending |
| 11 | Review gates | code-reviewer + ship-gate workflow | findings fixed or honestly deferred; all claims evidence-backed | pending |
| 12 | Docs/report/memory | README, REPORT-FOR-KRISTIAN.md, memory topic | push decision surfaced (repo currently local + private-create pending GitHub 503 retry) | pending |

Deviation note: full writing-plans ceremony compressed into this table + the LOCKED design doc
(time-boxed autonomous run; design doc carries per-component detail + error handling + testing).
