# OVERSTORY Registry — Design (v3 surface)

Date: 2026-07-21  Status: LOCKED (client directive: "connect to GitHub, upload local codebase,
it verifies it" — sharpened to the verified-registry architecture below)

## One line

A hosted registry of verified knowledge trees: paste any public GitHub repo for an instant
tree, or `overstory publish` your locally-built one — **the server re-verifies every receipt
against the actual GitHub content before accepting anything.**

## The trust model (the whole product)

Trees are self-verifying artifacts: every claim carries spans with text + hash. Therefore the
server never trusts an uploader — it fetches the repo snapshot from GitHub (codeload tarball,
shallow, by ref/sha) and runs the same pure gate the CLI runs. Publish acceptance rule:

- freshness == 1.0 against the fetched snapshot -> ACCEPTED (stored, hosted, badged)
- anything less -> REJECTED with the failing claims listed (nothing partial is ever hosted)

Consequences: no auth needed for v1 publishing (you cannot publish lies about a repo — the
receipts won't verify); no raw-code uploads (the tree contains only cited spans the repo
already exposes publicly); private code never touches the server (local `serve` remains the
private-repo product; a cloud builder for private repos is the documented PAID roadmap, not v1).

## Why the server runs zero LLMs

Building needs a model (expensive); verifying is hashing (free). The registry only ever:
fetch tarball -> normalize -> gate sweep -> store/serve. Instant extractive trees for
paste-a-URL use the same deterministic engine as the CLI. Runs entirely on Vercel functions +
Neon Postgres — no workers, no GPU, no new vendors, ~$0 infra.

## Surfaces

1. **overstory.northtek.io** — landing (v2 identity: paper-light, Fraunces, canopy): paste
   `owner/repo` -> instant extractive tree, hosted at `/gh/{owner}/{repo}`.
2. **Hosted explorer** — the v2 library experience read-only: tree rail, claim ledger,
   receipt unfolds, search + extractive answers (no server LLM). Freshness banner shows the
   verified sha + when the gate last ran.
3. **`npx overstory publish`** — uploads `.overstory/tree.json` + `owner/repo` + ref;
   on acceptance prints the hosted URL + README badge markdown.
4. **Badge** — `GET /badge/gh/{owner}/{repo}.svg` -> shields-style "overstory | verified 100%"
   (amber % when a later re-verify finds drift). The viral loop.
5. **Re-verify** — `POST /api/gh/{owner}/{repo}/verify` re-fetches HEAD and re-runs the gate
   (rate-limited); GitHub App webhook auto-re-verify is v3.1.

## Data model (Neon + Drizzle)

repos: id, owner, name, default_ref, created_at
trees: id, repo_id, ref, commit_sha, tree_gz (bytea, gzipped JSON), built_with
       (extractive|llm:model), claims int, verified int, freshness real,
       published_at, last_verified_at, last_freshness real

## Engine changes (main package)

- `buildTreeFromCorpus(corpus, opts)` extracted from buildTree (disk walk becomes one caller).
- `src/registry/github.ts`: zero-dep codeload tarball fetch + minimal tar reader (gzip via
  node:zlib) -> LoadedCorpus in memory. Caps: 40MB tarball, 5000 files, 1MB/file (same as CLI).
- `src/registry/registry.ts`: `instantTree(snapshot)`, `adjudicatePublish(tree, snapshot)`
  -> {accepted, freshness, failures[]} pure functions, fully unit-tested with fixture tarballs.
- CLI: `publish` command.

## Abuse/limits (v1)

Public GitHub repos only; size caps above; per-IP rate limit (10 builds/hour) via a Neon
counters table; tarballs never persisted — only the tree artifact is stored.

## Explicitly deferred (recorded, not forgotten)

GitHub OAuth ownership claims; webhook auto-verify; private-repo cloud builds (paid tier);
org dashboards; ask-with-LLM in the hosted explorer (needs per-user keys or paid tier).
