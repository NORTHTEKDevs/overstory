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
import { freshnessPct, verifyTree } from '../core/gate.js';
import { packageVersion } from '../core/version.js';
import { PROVIDER_CATALOG } from '../llm/catalog.js';
import { credentialsPath, maskKey, readCredentials } from '../core/credentials.js';
import { ollamaModels } from '../llm/ollama.js';
import { readHistory } from '../git/history.js';
import { documentationRisk, hotspots, knowledgeConcentration } from '../git/risk.js';
import { detectDrift } from '../drift/detect.js';

const HELP = `overstory — a knowledge tree of your codebase where every claim carries a receipt.
Local-first: nothing leaves this machine.

Usage:
  overstory build  [path]   Build or refresh the tree (resumable; reuses unchanged files)
  overstory serve  [path]   Open the app: ask your codebase, every answer notarized
  overstory verify [path]   Check every receipt against the current code (exit 1 if any fail)
  overstory ask "question" [path]   Answer from the tree with per-sentence receipts
  overstory fix    [path]   Paste-ready fix prompts for your agent, grounded in receipts
  overstory site   [path]   Export the shareable single-file explorer
  overstory mcp    [path]   Serve MCP tools over stdio (map/search/node/verify)
  overstory drift  [path]   Docs you did not update for code you did change (no tree needed)
  overstory insight [path]  Hotspots, ownership, coupling, and documentation risk (from git)
  overstory providers       Show available models and APIs, and where your keys are

Options:
  --provider <auto|ollama|anthropic|none>   LLM for summaries (default auto; none = extractive)
  --model <name>            Override the provider model
  --rounds <n>              Reflexion critique rounds (default 1)
  --include <glob>          Only include matching paths (repeatable)
  --max-files <n>           Corpus cap (default 5000)
  --out <file>              Output path for site
  --port <n>                Port for serve (default 7433)
  --base <ref>              drift: compare against this ref (e.g. main)
  --head <ref>              drift: compare up to this ref instead of the working tree
  --include-body            drift: also flag changes below the declaration line
  --json                    Machine-readable output
  --version, -v             Print the installed version
  --help, -h                Show this help
`;

interface Flags {
  provider: string;
  base?: string;
  head?: string;
  includeBody: boolean;
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
  const flags: Flags = { provider: 'auto', rounds: 1, include: [], json: false, includeBody: false };
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
    else if (a === '--base') flags.base = argv[++i];
    else if (a === '--head') flags.head = argv[++i];
    else if (a === '--include-body') flags.includeBody = true;
    else if (a === '--help' || a === '-h') positional.push('help');
    else if (a === '--version' || a === '-v') positional.unshift('version');
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

  if (cmd === 'version') {
    process.stdout.write(`${packageVersion()}\n`);
    return 0;
  }

  if (cmd === 'help') {
    process.stdout.write(HELP);
    return 0;
  }

  if (cmd === 'drift') {
    // No tree, no build, no config — the entire point. This has to work on a repo the user
    // heard about ninety seconds ago.
    const report = await detectDrift(root, {
      base: flags.base,
      head: flags.head,
      includeBody: flags.includeBody,
    });
    if (!report.available) {
      log(`Could not read a diff${report.reason ? ` (${report.reason})` : ''} — drift needs a git repository.`);
      return 2;
    }
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.findings.length > 0 ? 1 : 0;
    }
    if (report.findings.length === 0) {
      log(`No documentation drift across ${report.comparison} (${report.filesChanged} file${report.filesChanged === 1 ? '' : 's'} changed).`);
      return 0;
    }
    const n = report.findings.length;
    process.stdout.write(`\n  ${n} changed symbol${n === 1 ? '' : 's'} whose docs did not move\n\n`);
    for (const f of report.findings) {
      process.stdout.write(`  ${f.file}:${f.line}\n`);
      process.stdout.write(`    changed:  ${f.symbol}\n`);
      process.stdout.write(`    comment:  "${f.comment.length > 96 ? `${f.comment.slice(0, 95)}…` : f.comment}"\n`);
      process.stdout.write(`              lines ${f.commentStartLine}-${f.commentEndLine}, unchanged in this diff\n\n`);
    }
    process.stdout.write(`  Either the comment still holds and you can ignore this, or it does not and nobody would have noticed.\n\n`);
    return 1;
  }

  if (cmd === 'insight') {
    const tree = await loadTree(treePath(root));
    if (!tree) {
      log('No tree found. Run: overstory build');
      return 2;
    }
    const corpus = await loadCorpus(root, tree.corpusOptions ?? {});
    const verification = verifyTree(tree, corpus);
    const history = await readHistory(root);
    if (!history.available) {
      log(`No git history here${history.reason ? ` (${history.reason})` : ''} — insight needs a git repository.`);
      return 2;
    }
    // Only rank files that still exist: git remembers deletions, readers do not care.
    const live = new Set(corpus.files.keys());
    const risk = documentationRisk(tree, verification, history);
    const hot = hotspots(history, 10, live);
    const concentrated = knowledgeConcentration(history, 8, live);

    if (flags.json) {
      process.stdout.write(`${JSON.stringify({ commitsRead: history.commitsRead, risk, hotspots: hot, knowledgeConcentration: concentrated, coupling: history.coupling.slice(0, 20) }, null, 2)}\n`);
      return 0;
    }

    const when = (at: number | null): string => (at ? new Date(at * 1000).toISOString().slice(0, 10) : '—');
    process.stdout.write(`\n  Read ${history.commitsRead} commits across ${history.files.size} files.\n`);

    process.stdout.write(`\n  DOCUMENTATION RISK — active code whose docs are missing or no longer verify\n`);
    if (risk.length === 0) process.stdout.write('    nothing flagged.\n');
    for (const r of risk.slice(0, 10)) {
      process.stdout.write(`    ${String(r.score).padStart(3)}  ${r.file}\n`);
      process.stdout.write(`         ${r.reasons.join(' · ')}\n`);
    }

    process.stdout.write(`\n  HOTSPOTS — most change, weighted toward recent work\n`);
    for (const h of hot) {
      process.stdout.write(`    ${String(h.commits).padStart(4)} commits  ${h.file}  (last ${when(h.lastChangedAt)}, ${h.authors.length} author${h.authors.length === 1 ? '' : 's'})\n`);
    }

    if (concentrated.length > 0) {
      process.stdout.write(`\n  SINGLE-OWNER FILES — one person holds most of the history\n`);
      for (const h of concentrated) {
        process.stdout.write(`    ${Math.round(h.ownershipConcentration * 100)}%  ${h.file}  (${h.topAuthor})\n`);
      }
    }

    if (history.coupling.length > 0) {
      process.stdout.write(`\n  CHANGES TOGETHER — edit one, check the other\n`);
      const seen = new Set<string>();
      for (const c of history.coupling) {
        if (seen.has(c.file) || c.ratio < 0.5) continue;
        if (!live.has(c.file) || !live.has(c.partner)) continue;
        seen.add(c.file);
        process.stdout.write(`    ${Math.round(c.ratio * 100)}%  ${c.file} → ${c.partner}  (${c.together}x)\n`);
        if (seen.size >= 8) break;
      }
    }

    process.stdout.write(`\n  Every number above is counted from git, not modelled. Scores rank; they do not predict.\n`);
    return 0;
  }

  if (cmd === 'providers') {
    const stored = readCredentials();
    const installed = await ollamaModels();
    const rows = PROVIDER_CATALOG.map((p) => {
      const envKey = p.envVar ? process.env[p.envVar] : undefined;
      const fileKey = stored.keys[p.id];
      const key = envKey ?? fileKey;
      return {
        id: p.id,
        label: p.label,
        privacy: p.sendsCodeOffMachine ? 'sends code off this machine' : 'stays on this machine',
        keyStatus: envKey ? `set via ${p.envVar}` : fileKey ? `saved (${maskKey(fileKey)})` : p.needsKey ? 'no key' : 'no key needed',
        ready: p.id === 'ollama' ? installed.length > 0 : Boolean(key) || !p.needsKey,
        models: p.id === 'ollama' ? installed : p.models.map((m) => m.id),
      };
    });
    if (flags.json) {
      process.stdout.write(`${JSON.stringify({ providers: rows, credentialsPath: credentialsPath() }, null, 2)}\n`);
      return 0;
    }
    for (const r of rows) {
      process.stdout.write(`${r.ready ? '  ✓' : '  ·'} ${r.label}\n`);
      process.stdout.write(`      ${r.privacy} · ${r.keyStatus}\n`);
      if (r.models.length > 0) process.stdout.write(`      models: ${r.models.slice(0, 6).join(', ')}${r.models.length > 6 ? ', …' : ''}\n`);
    }
    process.stdout.write(`\n  Set a key: overstory serve → Models & keys, or export the environment variable.\n`);
    process.stdout.write(`  Keys are stored at ${credentialsPath()} and never leave this machine except to the provider you pick.\n`);
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
    // A local-model build of a real repo runs for tens of minutes. Without a size estimate
    // and a running ETA it is indistinguishable from a hang, and the honest escape hatch is
    // one flag away — so say so before the first long wait, not after it.
    let announced = false;
    let summarized = 0;
    let summarizeStart = 0;
    const result = await buildTree(root, {
      provider,
      critic,
      reflexionRounds: flags.rounds,
      include: flags.include.length ? flags.include : undefined,
      maxFiles: flags.maxFiles,
      onProgress: (e) => {
        if (e.phase === 'leaves' && e.total) {
          if (!announced) {
            announced = true;
            summarizeStart = Date.now();
            if (provider) {
              log(`  ${e.total} files to summarize. Local models typically take 20-60s each, so this can run long.`);
              log('  Ctrl-C and re-run with --provider none for an instant deterministic build.');
            }
          }
          if (!e.reused) summarized++;
          let eta = '';
          const done = e.done ?? 0;
          if (provider && summarized >= 2 && e.total > done) {
            const perFile = (Date.now() - summarizeStart) / summarized;
            const minutes = Math.round(((e.total - done) * perFile) / 60000);
            eta = minutes >= 1 ? `  ~${minutes}m left` : '  <1m left';
          }
          lastLine = `  leaves ${e.done}/${e.total} ${e.reused ? '(reused) ' : ''}${e.file ?? ''}${eta}`;
          log(lastLine);
        } else if (e.phase === 'aggregate' && e.done === 1) log('  rolling up directories…');
        else if (e.phase === 'verify') log('  gate sweep: verifying every receipt…');
        else if (e.phase === 'warn') log(`  WARNING: ${e.message ?? 'unknown'}`);
      },
    });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const pct = freshnessPct(result.verification.freshness);
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
    const pct = freshnessPct(result.verification.freshness);
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
    const html = generateSiteHtml(buildSiteData(tree, verification, corpus));
    const out = flags.out ?? join(root, '.overstory', 'site.html');
    await writeFile(out, html, 'utf8');
    log(`explorer written: ${out} (${(html.length / 1024).toFixed(0)} KB, single file, works offline)`);
    return 0;
  }

  if (cmd === 'fix') {
    const { scanFindings } = await import('../fix/scan.js');
    const { findingsToMarkdown } = await import('../fix/prompts.js');
    const tree = await loadTree(treePath(root));
    if (!tree) {
      log('No tree found. Run: overstory build   (then fix)');
      return 2;
    }
    const corpus = await loadCorpus(root, tree.corpusOptions ?? {});
    const verification = verifyTree(tree, corpus);
    // Scan the WHOLE repo, not the tree's build scope — a scope of src/** literally cannot
    // see tests/, which turns "untested module" into a lie.
    const scanCorpus = tree.corpusOptions?.include
      ? await loadCorpus(root, { maxFiles: tree.corpusOptions.maxFiles })
      : corpus;
    const findings = scanFindings(scanCorpus, tree, verification);
    if (flags.json) {
      process.stdout.write(JSON.stringify({ findings }) + '\n');
      return 0;
    }
    if (findings.length === 0) {
      log('No findings — this tree is clean by every deterministic check.');
      return 0;
    }
    const md = findingsToMarkdown(findings, tree.name);
    const out = flags.out ?? join(root, '.overstory', 'fixes.md');
    await writeFile(out, md, 'utf8');
    const sev = (n: number) => findings.filter((f) => f.severity === n).length;
    log(`${findings.length} findings (${sev(1)} fix-first, ${sev(2)} soon, ${sev(3)} when convenient) — each rendered as a paste-ready, receipt-grounded prompt`);
    for (const f of findings.slice(0, 10)) log(`  [${f.severity === 1 ? '!' : f.severity === 2 ? '~' : '·'}] ${f.title}`);
    if (findings.length > 10) log(`  … ${findings.length - 10} more`);
    log(`prompts: ${out}   (also in the app: overstory serve → Fixes)`);
    return 0;
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
