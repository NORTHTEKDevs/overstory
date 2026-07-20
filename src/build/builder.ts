import { rm } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { loadCorpus, LoadedCorpus } from '../core/corpus.js';
import { applyVerification, verifyTree } from '../core/gate.js';
import { loadTree, partialPath, saveTree, treePath } from '../core/store.js';
import type { Tree, TreeNode, TreeVerification } from '../core/types.js';
import type { ChatProvider } from '../llm/provider.js';
import { aggregateClaims } from './aggregate.js';
import { mapPool } from './pool.js';
import { refineClaims } from './reflexion.js';
import { summarizeFile } from './summarize.js';

export interface ProgressEvent {
  phase: 'scan' | 'leaves' | 'aggregate' | 'verify' | 'save';
  done?: number;
  total?: number;
  file?: string;
  reused?: boolean;
}

export interface BuildOptions {
  /** null = pure extractive build (deterministic, instant, no LLM). */
  provider?: ChatProvider | null;
  /** Critique model for the Reflexion pass; defaults to `provider`. */
  critic?: ChatProvider | null;
  /** 0 disables Reflexion. Default 1 (local models) — callers may raise for API providers. */
  reflexionRounds?: number;
  include?: string[];
  maxFiles?: number;
  name?: string;
  onProgress?: (e: ProgressEvent) => void;
  generator?: string;
}

export interface BuildResult {
  tree: Tree;
  verification: TreeVerification;
  corpus: LoadedCorpus;
  reusedLeaves: number;
  rebuiltLeaves: number;
}

const dirOf = (file: string): string => {
  const d = dirname(file).replace(/\\/gu, '/');
  return d === '.' ? '' : d;
};

/** All ancestor dir paths for a set of files, deepest first (so children exist before
 * their parent aggregates). */
const dirPaths = (files: string[]): string[] => {
  const dirs = new Set<string>();
  for (const f of files) {
    let d = dirOf(f);
    while (d !== '') {
      dirs.add(d);
      d = dirOf(d);
    }
  }
  return [...dirs].sort((a, b) => b.split('/').length - a.split('/').length || a.localeCompare(b));
};

/** Build (or refresh — same operation) the knowledge tree. Reuses any previous leaf whose
 * source hash still matches, upgrades extractive leaves when an LLM provider is available,
 * checkpoints progress after every leaf, and finishes with a full gate sweep. A killed
 * build resumes from its partial checkpoint on the next run. */
export const buildTree = async (root: string, opts: BuildOptions = {}): Promise<BuildResult> => {
  const provider = opts.provider ?? null;
  const critic = opts.critic ?? provider;
  const reflexionRounds = opts.reflexionRounds ?? 1;
  const emit = opts.onProgress ?? (() => {});

  emit({ phase: 'scan' });
  const corpus = await loadCorpus(root, { include: opts.include, maxFiles: opts.maxFiles });
  const files = [...corpus.files.keys()];
  const previous = (await loadTree(partialPath(root))) ?? (await loadTree(treePath(root)));

  const nodes: Record<string, TreeNode> = {};
  let reusedLeaves = 0;
  let rebuiltLeaves = 0;
  let done = 0;
  let checkpointChain = Promise.resolve();

  const checkpoint = () => {
    const snapshot: Tree = {
      version: 1,
      name: opts.name ?? basename(root),
      root: 'root',
      nodes: { ...nodes },
      corpusFiles: Object.fromEntries(files.map((f) => [f, { hash: corpus.files.get(f)!.hash, lines: corpus.files.get(f)!.lines.length }])),
      builtAt: new Date().toISOString(),
      generator: opts.generator ?? '@northtek/overstory',
    };
    checkpointChain = checkpointChain.then(() => saveTree(partialPath(root), snapshot)).catch(() => {});
  };

  await mapPool(files, provider?.concurrency ?? 8, async (file) => {
    const id = `leaf:${file}`;
    const hash = corpus.files.get(file)!.hash;
    const prior = previous?.nodes[id];
    const reusable =
      prior && prior.sourceHash === hash && (prior.builtWith === 'llm' || !provider);
    if (reusable) {
      nodes[id] = prior;
      reusedLeaves += 1;
      emit({ phase: 'leaves', done: ++done, total: files.length, file, reused: true });
      return;
    }
    const { claims: raw } = await summarizeFile(provider, file, corpus, id);
    let claims = raw;
    if (provider && critic && reflexionRounds > 0 && claims.length > 0) {
      const refined = await refineClaims(critic, file, claims, corpus, { maxRounds: reflexionRounds });
      claims = refined.claims;
    }
    nodes[id] = {
      id,
      kind: 'leaf',
      path: file,
      title: basename(file),
      summary: claims[0]?.text ?? '',
      claims,
      childIds: [],
      sourceHash: hash,
      builtWith: provider ? 'llm' : 'extractive',
      provider: provider?.name,
      builtAt: new Date().toISOString(),
    };
    rebuiltLeaves += 1;
    emit({ phase: 'leaves', done: ++done, total: files.length, file, reused: false });
    checkpoint();
  });
  await checkpointChain;

  // Interior nodes, deepest first; the root last. Dirs are cheap relative to leaves and are
  // always rebuilt so roll-ups never describe stale children.
  const dirs = dirPaths(files);
  const childrenOf = (dir: string): TreeNode[] => {
    const leaves = files.filter((f) => dirOf(f) === dir).map((f) => nodes[`leaf:${f}`]);
    const subdirs = dirs.filter((d) => dirOf(d) === dir && d !== dir).map((d) => nodes[`dir:${d}`]);
    return [...subdirs, ...leaves].filter(Boolean);
  };
  let aggDone = 0;
  for (const dir of dirs) {
    const children = childrenOf(dir);
    const id = `dir:${dir}`;
    const claims = await aggregateClaims(provider, dir, children, id);
    nodes[id] = {
      id,
      kind: 'dir',
      path: dir,
      title: dir.split('/').pop() ?? dir,
      summary: claims[0]?.text ?? '',
      claims,
      childIds: children.map((c) => c.id),
      builtWith: provider ? 'llm' : 'extractive',
      provider: provider?.name,
      builtAt: new Date().toISOString(),
    };
    emit({ phase: 'aggregate', done: ++aggDone, total: dirs.length + 1 });
  }
  const rootChildren = childrenOf('');
  const name = opts.name ?? basename(root);
  const rootClaims = await aggregateClaims(provider, name, rootChildren, 'root');
  nodes['root'] = {
    id: 'root',
    kind: 'root',
    path: '',
    title: name,
    summary: rootClaims[0]?.text ?? '',
    claims: rootClaims,
    childIds: rootChildren.map((c) => c.id),
    builtWith: provider ? 'llm' : 'extractive',
    provider: provider?.name,
    builtAt: new Date().toISOString(),
  };
  emit({ phase: 'aggregate', done: dirs.length + 1, total: dirs.length + 1 });

  const tree: Tree = {
    version: 1,
    name,
    root: 'root',
    nodes,
    corpusFiles: Object.fromEntries(files.map((f) => [f, { hash: corpus.files.get(f)!.hash, lines: corpus.files.get(f)!.lines.length }])),
    builtAt: new Date().toISOString(),
    generator: opts.generator ?? '@northtek/overstory',
  };

  emit({ phase: 'verify' });
  const verification = verifyTree(tree, corpus);
  const finalTree = applyVerification(tree, verification);

  emit({ phase: 'save' });
  await saveTree(treePath(root), finalTree);
  await rm(partialPath(root), { force: true });

  return { tree: finalTree, verification, corpus, reusedLeaves, rebuiltLeaves };
};

export interface VerifyResult {
  tree: Tree;
  verification: TreeVerification;
  staleFiles: string[];
}

/** Read-only verification of an existing tree against the live corpus. Applies verdicts and
 * healed positions in-memory; never writes. Null when no tree exists. */
export const verifyExisting = async (root: string, opts: Pick<BuildOptions, 'include' | 'maxFiles'> = {}): Promise<VerifyResult | null> => {
  const stored = await loadTree(treePath(root));
  if (!stored) return null;
  const corpus = await loadCorpus(root, { include: opts.include, maxFiles: opts.maxFiles });
  const verification = verifyTree(stored, corpus);
  const tree = applyVerification(stored, verification);
  const staleFiles = [...new Set(
    Object.values(tree.nodes)
      .filter((n) => n.kind === 'leaf')
      .filter((n) => n.claims.some((c) => c.verdict === 'STALE' || c.verdict === 'OUT_OF_CORPUS'))
      .map((n) => n.path),
  )];
  return { tree, verification, staleFiles };
};
