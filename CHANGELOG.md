# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-08-01

Documentation drift, with nothing to install and nothing to build.

### Added

- **`overstory drift`** reads a git diff and reports code you changed under doc comments you
  did not. It needs **no knowledge tree, no build and no configuration** — which removes the
  thing that made every other feature hard to adopt. Exit 1 on drift, so it doubles as a
  pre-commit hook. `--base`, `--head`, `--json`, `--include-body`.
- **A GitHub Action** (`uses: NORTHTEKDevs/overstory@v1`). It maintains one pull request
  comment and updates it in place rather than posting per push.

### Decisions

- **The Action does not fail builds by default.** `fail-on-drift` is false until a team turns
  it on. A tool that starts breaking CI the day it is installed gets removed before anyone
  sees what it is for.
- **Drift means the declaration line moved**, not the body. A body change can absolutely
  invalidate a comment and this default misses that; flagging every body edit would fire on
  ordinary refactors, and a review bot people mute is worth nothing. `--include-body` opts in.
- `DECL_RE` now lives in `docblock.ts` and is shared with the summarizer, so the two cannot
  disagree about what a declaration is.

## [0.5.0] - 2026-07-31

Git history, fused with the verification state — the one combination that needs both halves.

### Added

- **`overstory insight`**: documentation risk, hotspots, single-owner files, and co-change
  coupling, all counted from `git log`. The risk list is the novel part: it crosses churn with
  whether a file's claims still verify, so it answers "what should I read or document first"
  rather than "what changed most", which git alone already tells you.
- **`overstory_insight` and `overstory_file_history` MCP tools**, taking the server from four
  tools to six. An agent about to edit an unfamiliar file can now ask who owns it, how much it
  moves, and what it moves with.
- Coupling ignores sweeping commits (a formatting pass across 80 files implies no real
  relationship between them), and every ranking is filtered to files that still exist — git
  remembers deletions, readers do not care about them.

### Notes on honesty

The risk score is a ranking heuristic, not a defect predictor. It was not fitted to any
corpus, and presenting a hand-chosen weighting as a validated model would be exactly the kind
of confident-but-unearned claim this project exists to catch. Every row prints the reasons
that produced it.

Ownership findings are suppressed entirely below three contributors: in a solo repository
"100% owned by X" is true of every file and says nothing about the code.

### Added

- **Standalone binaries.** A release now publishes single-file executables for Linux, macOS
  (Intel and Apple Silicon) and Windows, built with `bun build --compile` and checksummed.
  Requiring Node was a real barrier for a tool whose whole pitch is that it runs anywhere with
  no setup; now you download one file and run it.

### Fixed

- `--version` reported `unknown` in a compiled binary, and the MCP handshake would have
  advertised the same. A single-file executable has no `package.json` on disk to read, so the
  version is injected at bundle time and falls back to the file read under Node.

## [0.4.1] - 2026-07-27

### Changed

- The README now shows the product: the claim ledger with a receipt unfolded to its file,
  line range, `sha256` and source line; the ask-first app; and the Models & keys panel. All
  captured from the running app rather than mocked up, and referenced by absolute URL so they
  render on the npm page as well as on GitHub. No code changes.

## [0.4.0] - 2026-07-27

Bring your own key, without leaving the app.

### Added

- **Models & keys panel** in `overstory serve`. Shows every provider, whether it keeps your
  code on the machine, whether it is ready to use, and which models are available — Ollama's
  list is read live from what you have actually pulled, so it never suggests a model you would
  have to wait several minutes to discover you do not have. Paste a key, pick a model, and
  **rebuild in place** with streamed progress; a key that does nothing until you find your
  terminal again is not a setting, it is a chore.
- **`overstory providers`** prints the same information, with `--json` for scripts.
- **OpenAI-compatible provider.** One implementation covers OpenAI, OpenRouter, Groq,
  Together, Fireworks, DeepInfra, LM Studio, llama.cpp, and vLLM — set a base URL and a model
  id. Local endpoints may omit the key entirely.
- **Anthropic and OpenAI catalogs**: Claude Haiku 4.5 / Sonnet 5 / Opus 5, GPT-5 mini / GPT-5.

### Security

- **Keys are stored in `~/.overstory/credentials.json`, mode `0600` — never in the project.**
  A project's `.overstory/` holds the `tree.json` this project tells people to commit, and a
  credentials file next to it is an accident waiting to happen. Keys are per-person anyway.
- **A saved key is never readable back through the local API.** The panel receives a masked
  hint and nothing more.
- **The local server now refuses non-loopback `Host` headers and foreign `Origin`s.** Binding
  to `127.0.0.1` stops other machines, not other *pages*: any site open in your browser can
  issue requests to localhost, and DNS rebinding lets an attacker-controlled name resolve
  there. With credentials reachable through this server that is a theft path, so both are
  checked on every route.
- Environment variables take precedence over saved keys, so a deliberately-set key is never
  silently overridden.

### Fixed

- The app shell's inline JavaScript had no test that it parses. The file is a single
  TypeScript template literal, where a stray backtick ends the template and a bare `\n`
  becomes a real newline inside a JS string — both compile cleanly and both produce a blank
  page. Now asserted.

## [0.3.0] - 2026-07-27

The no-LLM path is now the good path. Previously a build without a model produced claims like
``Declares `const K1` `` — technically true, useless to read, and the default experience for
anyone who ran `npx @northtek/overstory build` without Ollama installed.

### Added

- **Doc comments become verified claims.** A declaration carrying a doc comment now produces
  a claim from the author's own description, citing the comment *and* the declaration as one
  span. `` `saveTree(path, tree)`: Atomic save: write temp then rename, so a killed build
  never corrupts the tree. `` Because both are in the receipt, editing the code without
  updating the comment flips the claim to `STALE` — deterministic comment-rot detection with
  no model involved. Supports JSDoc/block comments, `//`, `///`, `#`, and `--` runs, and steps
  over decorators and attributes.
- **Signatures instead of raw source lines.** `Exports \`read(path, opts)\`` rather than
  ``Declares `export function read`.``, with types dropped for readability (the receipt still
  carries the exact source).
- **Claim ranking.** Documented and exported symbols outrank private declarations when a
  chunk has more candidates than slots, so a documented function is no longer buried under
  the private constants that happen to precede it.
- **Build ETA and an escape hatch.** An LLM build announces how many files it will summarize
  and shows a running estimate, because a 30-minute local-model build with no feedback is
  indistinguishable from a hang.

### Fixed

- **Source directories named `build`, `dist`, `out`, `target`, or `vendor` were silently
  dropped.** These names were excluded at any depth, so `src/build/` — this project's own
  builder, seven files — never entered its own knowledge tree, and any Java, Rust, or Go
  project with a source path containing them lost code with no warning. They are now excluded
  only at the repository root; dependency and tool directories are still excluded everywhere.
- **`100% verified` could print alongside `stale evidence in: ...`.** 416 of 417 claims is
  99.76%, which rounded to "100%". Freshness now floors, and 100 is reserved for a tree with
  nothing stale. Applied to the CLI, the local app, and the exported explorer.
- Optional parameters kept their `?` in generated signatures (`read(path, opts?)`).

## [0.2.0] - 2026-07-26

Scope decision: OVERSTORY is a local tool and an MCP server. There is no hosted service, and
there will not be one.

### Removed

- **`overstory publish` and the hosted registry.** The Next.js registry app, the GitHub
  tarball fetcher, the publish client, the freshness badge endpoint, and the registry design
  doc are all gone. Publishing a tree is now what it always should have been: commit
  `.overstory/tree.json`, or send someone the `overstory site` export.
- **The browser "Ask this codebase" panel** from the exported explorer. It only ever rendered
  on hosted pages, was never exercised against a live API, and shipped a browser-to-Anthropic
  code path into an artifact that is supposed to be inert.
- **Open Graph / Twitter share metadata** from the export, which existed only for hosted pages.

### Fixed

- **The exported explorer no longer loads webfonts from Google.** It was described as
  self-contained and offline while fetching three resources from `fonts.googleapis.com`, so
  opening a shared explorer disclosed to a third party that it had been opened. The export now
  issues no network requests of any kind, enforced by a test that asserts their absence.
  Typography falls back to locally installed faces. The local `serve` app still uses webfonts.

## [0.1.1] - 2026-07-25

### Added

- `overstory --version` (and `-v`). Previously both fell through to the help text.

### Security

- **Registry: bounded decompression.** `fetchGithubSnapshot` capped the *compressed* tarball
  at 40 MB but decompressed without an output ceiling. A public repository of highly
  compressible files stays far under the compressed cap while expanding to gigabytes,
  exhausting the function's memory. Decompression now runs under an explicit
  `maxUncompressedBytes` ceiling (default 400 MB) and fails with a clear error.
- **Registry: streaming transfer cap.** The response body was buffered in full before its
  size was checked, so the cap could not prevent the allocation it was meant to prevent. The
  body is now read against a running ceiling and the transfer is cancelled as soon as it is
  exceeded.
- **Registry: stricter path segment validation.** `owner` and `repo` rejected spaces and
  slashes but accepted `..` and unbounded length. Both are now rejected before the URL is
  constructed, matching the validation already applied to `ref`.

## [0.1.0] - 2026-07-24

First public release.

### Added

- `overstory build` — hierarchical knowledge tree of a repo or docs folder; every claim cites
  source spans hashed over normalized text. Incremental and resumable; unchanged files are
  never re-summarized.
- `overstory verify` — re-checks every receipt against the live corpus, exits non-zero when
  documentation and code disagree.
- `overstory serve` — local answer engine over the tree with streamed phases, numbered
  citation chips, and receipt cards that unfold into the cited lines.
- `overstory ask` — per-sentence answers with receipts; unverifiable statements are withheld
  and labelled rather than silently dropped.
- `overstory site` — self-contained single-file HTML explorer.
- `overstory fix` — deterministic finding scanner producing receipt-grounded fix prompts.
- `overstory mcp` — MCP server exposing `overstory_map`, `overstory_search`, `overstory_node`,
  and `overstory_verify`, which notarizes a host agent's own drafted claims.
- `overstory publish` — publishes a locally built tree to the hosted registry, which
  re-verifies it against the live repository before accepting it.
- Providers: local Ollama, deterministic extractive (no LLM), and opt-in Anthropic API.

[Unreleased]: https://github.com/NORTHTEKDevs/overstory/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/NORTHTEKDevs/overstory/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/NORTHTEKDevs/overstory/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/NORTHTEKDevs/overstory/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/NORTHTEKDevs/overstory/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/NORTHTEKDevs/overstory/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/NORTHTEKDevs/overstory/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/NORTHTEKDevs/overstory/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/NORTHTEKDevs/overstory/releases/tag/v0.1.0
