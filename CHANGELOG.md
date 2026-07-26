# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/NORTHTEKDevs/overstory/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/NORTHTEKDevs/overstory/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/NORTHTEKDevs/overstory/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/NORTHTEKDevs/overstory/releases/tag/v0.1.0
