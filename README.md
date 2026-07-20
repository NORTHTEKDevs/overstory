# OVERSTORY

**A knowledge tree of your codebase where every claim carries a receipt.**

OVERSTORY turns any repo or docs folder into an explorable, hierarchical map — file to module
to system — in which every statement is an atomic claim citing the exact source lines that
support it. Citations are verified mechanically, not displayed decoratively: a claim whose
evidence changed is marked stale, a claim whose evidence vanished is marked missing, and a
claim with no evidence is never presented as verified.

Local-first by default. With the local Ollama engine or the deterministic extractive engine
(no LLM at all), your code never leaves your machine — air-gapped works. The Anthropic API is
an explicit opt-in, and only then does source text leave the machine (to Anthropic, for
summarization). The gate itself is always local.

```
npx @northtek/overstory build     # build the tree (resumable; reuses unchanged files)
npx @northtek/overstory site      # single-file explorer -> .overstory/site.html
npx @northtek/overstory ask "how does auth work?"
npx @northtek/overstory verify    # CI-friendly: exit 1 if any receipt fails
npx @northtek/overstory mcp       # MCP tools for Claude Code / Cursor
```

## Why

AI tools that explain codebases have a trust problem: confident answers with citations that
are displayed but never checked, over docs that silently rot as the code moves on. OVERSTORY
inverts the contract:

- **Receipts by construction** — the unit of storage is the claim + its cited spans, hashed
  over the span *text* (never file positions). Edits above a span heal its line numbers;
  edits to the evidence itself flip the claim to `STALE`.
- **Fail-closed verdicts** — `VERIFIED` / `STALE` / `OUT_OF_CORPUS` / `UNGROUNDED`, computed
  by a pure function against the live corpus. A forged receipt voids the claim.
- **Honest staleness** — `overstory verify` re-checks every receipt in milliseconds and exits
  non-zero when docs and code disagree. Docs that know when they're lying.
- **Two disclosure tiers** — the mechanical verdict above, plus a build-time semantic
  `faithfulness` tier from an adversarial critique pass (Reflexion-style). Claims the critic
  rejects stay visible and flagged — abstention over confident prose, never silent deletion.

**The honesty boundary, stated plainly:** verification here proves *provenance and freshness*
(the cited lines exist and are unchanged), not truth. Semantic support is checked once at
build time and labeled. Every claim is one click from its evidence; judge it yourself.

## How it works

1. **Ingest** — gitignore-aware walk, structural chunking (headings / top-level declarations).
2. **Summarize** — each chunk becomes 3-8 atomic claims with line citations (Ollama local,
   Anthropic API, or extractive fallback — malformed LLM output degrades per-chunk, a build
   never dies on one bad response).
3. **Refine** — an adversarial critique pass fact-checks each claim against its cited lines
   (supported / unsupported), revises what it can defend, and surfaces missing facts.
4. **Aggregate** — directory and root nodes roll up from child claims, every roll-up claim
   citing the child claims that ground it, transitively down to source lines.
5. **Gate** — every claim in the tree is verified; freshness is a first-class number.
6. **Explore** — a single self-contained HTML explorer (works offline, shareable), a CLI,
   and an MCP server.

Builds are incremental and resumable: every leaf checkpoints on completion, and unchanged
files are never re-summarized.

## MCP: notarize your agent's answers

`overstory mcp` exposes `overstory_map`, `overstory_search`, `overstory_node`, and the tool
the others exist for — **`overstory_verify`**: your agent (Claude Code, Cursor) drafts an
answer about the repo, submits its claims with file:line citations, and gets back per-claim
verdicts plus the receipt text for each citation. The host model does the thinking;
OVERSTORY checks the receipts.

```json
{ "mcpServers": { "overstory": { "command": "npx", "args": ["-y", "@northtek/overstory", "mcp"] } } }
```

## Provenance of the ideas

OVERSTORY is the TypeScript synthesis of research shipped in
[FACTGATE](https://github.com/NORTHTEKDevs/factgate) (fail-closed claim gating),
[verified-memory](https://github.com/NORTHTEKDevs/verified-memory) (memory feeds context in,
a gate adjudicates claims out), [GENOME](https://github.com/NORTHTEKDevs/genome)
(hierarchical RAPTOR summarization — including the published null that tree retrieval is
accuracy-neutral: the tree's value is the explorable provenance artifact, which is exactly
what OVERSTORY ships), and RAIN's Reflexion loop discipline. BSHR
(brainstorm-search-hypothesize-refine) drives the `ask` engine.

## Roadmap (deliberately not in v1)

Embedding search, AST-precise chunking, watch mode, a CI bot that comments when merged code
stales the docs, team/shared trees, `claude -p` as a provider. v1 is the trustworthy core.

## License

Apache-2.0 © Northtek (FrostByte LLC)
