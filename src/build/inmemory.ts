import { basename } from 'node:path';
import type { LoadedCorpus } from '../core/corpus.js';
import { applyVerification, verifyTree } from '../core/gate.js';
import type { Tree, TreeNode, TreeVerification } from '../core/types.js';
import type { ChatProvider } from '../llm/provider.js';
import { aggregateClaims } from './aggregate.js';
import { dirOf, dirPaths } from './builder.js';
import { summarizeFile } from './summarize.js';

export interface InMemoryBuildOptions {
  name: string;
  provider?: ChatProvider | null;
  generator?: string;
}

/** Build a complete verified tree from an in-memory corpus — no disk, no locks, no
 * checkpoints. This is the registry's engine (serverless, deterministic when provider is
 * null); the disk builder in builder.ts keeps its resume/checkpoint machinery for long
 * local LLM builds. */
export const buildTreeFromCorpus = async (
  corpus: LoadedCorpus,
  opts: InMemoryBuildOptions,
): Promise<{ tree: Tree; verification: TreeVerification }> => {
  const provider = opts.provider ?? null;
  const files = [...corpus.files.keys()];
  const nodes: Record<string, TreeNode> = {};

  for (const file of files) {
    const id = `leaf:${file}`;
    const { claims } = await summarizeFile(provider, file, corpus, id);
    nodes[id] = {
      id,
      kind: 'leaf',
      path: file,
      title: basename(file),
      summary: claims[0]?.text ?? '',
      claims,
      childIds: [],
      sourceHash: corpus.files.get(file)!.hash,
      builtWith: provider ? 'llm' : 'extractive',
      provider: provider?.name,
      builtAt: new Date().toISOString(),
    };
  }

  const dirs = dirPaths(files);
  const childrenOf = (dir: string): TreeNode[] => {
    const leaves = files.filter((f) => dirOf(f) === dir).map((f) => nodes[`leaf:${f}`]);
    const subdirs = dirs.filter((d) => dirOf(d) === dir && d !== dir).map((d) => nodes[`dir:${d}`]);
    return [...subdirs, ...leaves].filter(Boolean);
  };
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
  }
  const rootChildren = childrenOf('');
  const rootClaims = await aggregateClaims(provider, opts.name, rootChildren, 'root');
  nodes['root'] = {
    id: 'root',
    kind: 'root',
    path: '',
    title: opts.name,
    summary: rootClaims[0]?.text ?? '',
    claims: rootClaims,
    childIds: rootChildren.map((c) => c.id),
    builtWith: provider ? 'llm' : 'extractive',
    provider: provider?.name,
    builtAt: new Date().toISOString(),
  };

  const tree: Tree = {
    version: 1,
    name: opts.name,
    root: 'root',
    nodes,
    corpusFiles: Object.fromEntries(files.map((f) => [f, { hash: corpus.files.get(f)!.hash, lines: corpus.files.get(f)!.lines.length }])),
    builtAt: new Date().toISOString(),
    generator: opts.generator ?? '@northtek/overstory',
  };
  const verification = verifyTree(tree, corpus);
  return { tree: applyVerification(tree, verification), verification };
};
