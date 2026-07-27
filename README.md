# OVERSTORY

[![CI](https://github.com/NORTHTEKDevs/overstory/actions/workflows/ci.yml/badge.svg)](https://github.com/NORTHTEKDevs/overstory/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@northtek/overstory)](https://www.npmjs.com/package/@northtek/overstory)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

**A knowledge tree of your codebase where every claim carries a receipt.**

> There is no hosted service, no account, and nothing to sign up for. It runs on your machine
> and it stays there. CI on this repository verifies its own claims against its own code on
> every push — that gate is the only thing the badges above report.

Every doc comment is a claim about the code beneath it. Nobody checks those claims, so they
rot quietly — the signature changes, the comment doesn't, and the lie ships. OVERSTORY reads
your repo into a tree of atomic claims, each citing the exact lines that support it, and
verifies every one against the live code. When the evidence changes, the claim goes stale
instead of staying confidently wrong.

```console
$ npx @northtek/overstory build
provider: extractive (no LLM)
done in 0.2s — 88 nodes, 381 claims, 100% verified

$ # someone renames a parameter and leaves the comment above it alone

$ npx @northtek/overstory verify
99% of claims verified against the current code
stale evidence in: src/core/corpus.ts
run: overstory build   (rebuilds only what changed)

$ echo $?
1
```

**No API key, no model, no network.** The default build derives claims from your code's own
structure and doc comments, so a documented function becomes a claim you can check:

> **`saveTree(path, tree)`**: Atomic save: write temp then rename, so a killed build never
> corrupts the tree. &nbsp;`VERIFIED`

The receipt cites the comment *and* the signature as one span. Change either without the
other and the gate catches it. That much works with zero AI involved. Point it at a local
Ollama model or the Anthropic API and the same tree gets prose summaries instead — same gate,
same receipts, your choice of how much machine you want in the loop.

## Models and APIs

Run `overstory providers` to see what is available on your machine, or open
`overstory serve` → **Models & keys** to paste a key and rebuild without touching a terminal.

| Provider | Your code leaves the machine? | Key | Models |
|---|---|---|---|
| **Built-in** (default) | No | none | none — claims come from your doc comments and signatures |
| **Ollama** | No | none | whatever you have pulled; `qwen2.5:14b` is a good default |
| **Anthropic** | Yes | `ANTHROPIC_API_KEY` | Claude Haiku 4.5, Sonnet 5, Opus 5 |
| **OpenAI** | Yes | `OPENAI_API_KEY` | GPT-5 mini, GPT-5 |
| **Any OpenAI-compatible endpoint** | Yes | optional | OpenRouter, Groq, Together, Fireworks, DeepInfra, LM Studio, llama.cpp, vLLM — set the base URL and model id |

Keys pasted into the app are written to `~/.overstory/credentials.json` with owner-only
permissions. They are never stored in your repository, never sent anywhere except the provider
you picked, and never returned by the local API once saved — the settings panel only ever sees
a masked hint. An environment variable always wins over a saved key.

The gate is always local, whichever provider you choose. Verification is hashing, not
inference, so it costs nothing and works offline even when the summaries did not.

Local-first by default: with Ollama or the built-in engine, your code never leaves your
machine — air-gapped works. A hosted API is an explicit opt-in, and only then does source
text leave the machine.

```
npx @northtek/overstory build     # build the tree (resumable; reuses unchanged files)
npx @northtek/overstory serve     # open the app: ask your codebase, answers notarized
npx @northtek/overstory verify    # CI-friendly: exit 1 if any receipt fails
npx @northtek/overstory mcp       # MCP tools for Claude Code / Cursor
npx @northtek/overstory site      # shareable single-file explorer
```

**The app** (`overstory serve`) is a local, frontier-lab-grade answer engine over your repo:
ask-first home, streamed phases (searching → writing → notarizing), answers with numbered
citation chips, and receipt cards that unfold into the exact cited lines with their hash and
verdict seal. Threads persist locally; light and dark themes; nothing leaves your machine.

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

## Sharing a tree

`overstory site` writes one HTML file with the whole explorer inside it — no scripts, no
stylesheets, not even a webfont. Open it from disk, attach it to an email, commit it. It
makes zero network requests, so sharing a tree tells nobody that it was opened.

For a repository, committing `.overstory/tree.json` and adding `overstory verify` to CI is
the durable version: reviewers see the claims in the diff, and the build fails when merged
code stales them.

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
stales the docs, `claude -p` as a provider. The trustworthy local core is the whole of v1, and
a hosted service is explicitly not on this list.

## License

Apache-2.0 © Northtek (FrostByte LLC)
