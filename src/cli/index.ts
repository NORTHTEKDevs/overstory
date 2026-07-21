#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildTree, verifyExisting } from '../build/builder.js';
import { loadCorpus } from '../core/corpus.js';
import { loadTree, treePath } from '../core/store.js';
import { resolveProviders } from '../llm/resolve.js';
import { runStdioServer } from '../mcp/server.js';
import { serve } from '../serve/server.js';
import { ask } from '../query/ask.js';
import { buildSiteData } from '../site/data.js';
import { generateSiteHtml } from '../site/generate.js';
import { verifyTree } from '../core/gate.js';

const HELP = `overstory — a knowledge tree of your codebase where every claim carries a receipt.
Local-first: nothing leaves this machine.

Usage:
  overstory build  [path]   Build or refresh the tree (resumable; reuses unchanged files)
  overstory serve  [path]   Open the app: ask your codebase, every answer notarized
  overstory verify [path]   Check every receipt against the current code (exit 1 if any fail)
  overstory ask "question" [path]   Answer from the tree with per-sentence receipts
  overstory publish [path]  Publish your tree to the registry (re-verified server-side)
  overstory site   [path]   Export the shareable single-file explorer
  overstory mcp    [path]   Serve MCP tools over stdio (map/search/node/verify)

Options:
  --provider <auto|ollama|anthropic|none>   LLM for summaries (default auto; none = extractive)
  --model <name>            Override the provider model
  --rounds <n>              Reflexion critique rounds (default 1)
  --include <glob>          Only include matching paths (repeatable)
  --max-files <n>           Corpus cap (default 5000)
  --out <file>              Output path for site
  --port <n>                Port for serve (default 7433)
  --json                    Machine-readable output
`;

interface Flags {
  provider: string;
  model?: string;
  rounds: number;
  include: string[];
  maxFiles?: number;
  out?: string;
  port?: number;
  json: boolean;
}

/** A mis-typed numeric flag must error, never silently disable the cap it configures. */
const numFlag = (raw: string | undefined, flag: string): number => {
  const n = Number(raw);
  if (raw === undefined || !Number.isFinite(n) || n < 0) {
    throw new Error(`${flag} requires a non-negative number (got "${raw ?? ''}")`);
  }
  return n;
};

const parseArgs = (argv: string[]): { cmd: string; positional: string[]; flags: Flags } => {
  const flags: Flags = { provider: 'auto', rounds: 1, include: [], json: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') flags.json = true;
    else if (a === '--provider') flags.provider = argv[++i] ?? 'auto';
    else if (a === '--model') flags.model = argv[++i];
    else if (a === '--rounds') flags.rounds = numFlag(argv[++i], '--rounds');
    else if (a === '--include') flags.include.push(argv[++i] ?? '');
    else if (a === '--max-files') flags.maxFiles = numFlag(argv[++i], '--max-files');
    else if (a === '--out') flags.out = argv[++i];
    else if (a === '--port') flags.port = numFlag(argv[++i], '--port');
    else if (a === '--help' || a === '-h') positional.push('help');
    else positional.push(a);
  }
  const cmd = positional.shift() ?? 'help';
  return { cmd, positional, flags };
};

const log = (msg: string): void => {
  process.stderr.write(`${msg}\n`);
};

const resolveProvider = (flags: Flags) =>
  resolveProviders({ provider: flags.provider, model: flags.model, onNotice: log });

const main = async (): Promise<number> => {
  const { cmd, positional, flags } = parseArgs(process.argv.slice(2));
  const rootArg = positional[cmd === 'ask' ? 1 : 0];
  const root = resolve(rootArg ?? '.');

  if (cmd === 'help') {
    process.stdout.write(HELP);
    return 0;
  }

  if (rootArg !== undefined && !existsSync(root)) {
    log(
      cmd === 'ask'
        ? `path not found: ${root} — quote multi-word questions: overstory ask "your question here"`
        : `path not found: ${root}`,
    );
    return 2;
  }

  if (cmd === 'build') {
    const { provider, critic } = await resolveProvider(flags);
    log(`overstory build — ${root}`);
    log(provider ? `provider: ${provider.name} (reflexion rounds: ${flags.rounds})` : 'provider: extractive (no LLM)');
    const started = Date.now();
    let lastLine = '';
    const result = await buildTree(root, {
      provider,
      critic,
      reflexionRounds: flags.rounds,
      include: flags.include.length ? flags.include : undefined,
      maxFiles: flags.maxFiles,
      onProgress: (e) => {
        if (e.phase === 'leaves' && e.total) {
          lastLine = `  leaves ${e.done}/${e.total} ${e.reused ? '(reused) ' : ''}${e.file ?? ''}`;
          log(lastLine);
        } else if (e.phase === 'aggregate' && e.done === 1) log('  rolling up directories…');
        else if (e.phase === 'verify') log('  gate sweep: verifying every receipt…');
        else if (e.phase === 'warn') log(`  WARNING: ${e.message ?? 'unknown'}`);
      },
    });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const pct = Math.round(result.verification.freshness * 100);
    if (flags.json) {
      process.stdout.write(JSON.stringify({
        nodes: Object.keys(result.tree.nodes).length,
        claims: result.verification.verdicts.size,
        freshness: result.verification.freshness,
        reusedLeaves: result.reusedLeaves,
        rebuiltLeaves: result.rebuiltLeaves,
        skipped: result.corpus.skipped,
        seconds: Number(secs),
      }) + '\n');
    } else {
      log(`done in ${secs}s — ${Object.keys(result.tree.nodes).length} nodes, ${result.verification.verdicts.size} claims, ${pct}% verified (${result.reusedLeaves} leaves reused, ${result.rebuiltLeaves} rebuilt)`);
      log(`tree: ${treePath(root)}`);
      log(`next: overstory site  ·  overstory ask "what does this repo do?"  ·  overstory mcp`);
    }
    return 0;
  }

  if (cmd === 'verify') {
    const result = await verifyExisting(root, { include: flags.include.length ? flags.include : undefined, maxFiles: flags.maxFiles });
    if (!result) {
      log('No tree found (or the tree file is invalid). Run: overstory build');
      return 2;
    }
    const pct = Math.round(result.verification.freshness * 100);
    if (flags.json) {
      process.stdout.write(JSON.stringify({ freshness: result.verification.freshness, staleFiles: result.staleFiles }) + '\n');
    } else {
      log(`${pct}% of claims verified against the current code`);
      if (result.staleFiles.length > 0) {
        log(`stale evidence in: ${result.staleFiles.join(', ')}`);
        log('run: overstory build   (rebuilds only what changed)');
      }
    }
    return result.verification.freshness === 1 ? 0 : 1;
  }

  if (cmd === 'ask') {
    const question = positional[0];
    if (!question) {
      log('usage: overstory ask "your question" [path]');
      return 2;
    }
    const tree = await loadTree(treePath(root));
    if (!tree) {
      log('No tree found. Run: overstory build');
      return 2;
    }
    const { provider } = await resolveProvider(flags);
    const corpus = await loadCorpus(root, tree.corpusOptions ?? {});
    const result = await ask(question, tree, corpus, provider);
    if (flags.json) {
      process.stdout.write(JSON.stringify(result) + '\n');
      return 0;
    }
    process.stdout.write(`\n${result.question}\n\n`);
    for (const s of result.sentences) {
      const refs = s.refs.map((r) => r.replace(/^leaf:/u, '')).join(', ');
      process.stdout.write(`  [${s.verdict}] ${s.text}\n           receipts: ${refs}\n`);
    }
    if (result.unverifiable.length > 0) {
      process.stdout.write(`\n  quarantined (no verifiable citation — do not trust):\n`);
      for (const u of result.unverifiable) process.stdout.write(`  [UNVERIFIABLE] ${u}\n`);
    }
    process.stdout.write(`\n  grounding: ${Math.round(result.grounding * 100)}% of sentences verified · mode: ${result.mode}\n`);
    return 0;
  }

  if (cmd === 'site') {
    const tree = await loadTree(treePath(root));
    if (!tree) {
      log('No tree found. Run: overstory build');
      return 2;
    }
    const corpus = await loadCorpus(root, tree.corpusOptions ?? {});
    const verification = verifyTree(tree, corpus);
    const html = generateSiteHtml(buildSiteData(tree, verification));
    const out = flags.out ?? join(root, '.overstory', 'site.html');
    await writeFile(out, html, 'utf8');
    log(`explorer written: ${out} (${(html.length / 1024).toFixed(0)} KB, single file, works offline)`);
    return 0;
  }

  if (cmd === 'publish') {
    const { DEFAULT_REGISTRY, detectGithubRepo, publishTree } = await import('../registry/publishClient.js');
    const tree = await loadTree(treePath(root));
    if (!tree) {
      log('No tree found. Run: overstory build   (then publish)');
      return 2;
    }
    const repoFlagIdx = process.argv.indexOf('--repo');
    const repoFlag = repoFlagIdx >= 0 ? process.argv[repoFlagIdx + 1] : undefined;
    const parsed = repoFlag?.includes('/')
      ? { owner: repoFlag.split('/')[0], repo: repoFlag.split('/')[1] }
      : await detectGithubRepo(root);
    if (!parsed) {
      log('Could not detect a GitHub remote. Pass --repo owner/name.');
      return 2;
    }
    const registry = process.env.OVERSTORY_REGISTRY ?? DEFAULT_REGISTRY;
    log(`publishing ${parsed.owner}/${parsed.repo} to ${registry} — the registry will re-verify every receipt against GitHub before accepting`);
    const result = await publishTree(registry, parsed.owner, parsed.repo, 'HEAD', tree);
    if (flags.json) {
      process.stdout.write(JSON.stringify(result) + '\n');
      return result.verdict?.accepted ? 0 : 1;
    }
    if (result.verdict?.accepted) {
      log(`ACCEPTED — ${result.verdict.verified}/${result.verdict.claims} receipts verified against GitHub`);
      if (result.url) log(`hosted: ${result.url}`);
      if (result.badge) log(`badge:  ${result.badge}`);
      return 0;
    }
    log(`REJECTED — ${result.verdict?.verified ?? 0}/${result.verdict?.claims ?? 0} receipts verified (the registry hosts only 100%-verified trees)`);
    for (const f of result.verdict?.failures ?? []) log(`  [${f.verdict}] ${f.claimId}: ${f.text}`);
    log('fix: push your latest code, run overstory build, then publish again');
    return 1;
  }

  if (cmd === 'serve') {
    const tree = await loadTree(treePath(root));
    if (!tree) {
      log('No tree found. Run: overstory build   (then serve)');
      return 2;
    }
    const { provider } = await resolveProvider(flags);
    await serve(root, {
      provider,
      port: flags.port,
      onReady: (address) => {
        log(`overstory is up: ${address}`);
        log('ask your codebase — every answer is notarized against the code');
        try {
          // best-effort browser open; the URL above is the contract
          import('node:child_process').then(({ spawn }) =>
            spawn(process.platform === 'win32' ? 'cmd' : 'open', process.platform === 'win32' ? ['/c', 'start', '', address] : [address], { detached: true, stdio: 'ignore' }).unref(),
          );
        } catch {
          /* fine — user opens the printed URL */
        }
      },
    });
    return 0;
  }

  if (cmd === 'mcp') {
    await runStdioServer(root);
    return 0;
  }

  process.stdout.write(HELP);
  return 2;
};

// process.exitCode (not process.exit) lets in-flight handles drain — hard exits race
// undici/libuv teardown on Windows. The mcp command stays alive via its stdio transport.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`overstory: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  },
);
