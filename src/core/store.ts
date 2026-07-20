import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { Tree } from './types.js';

const spanSchema = z.object({
  file: z.string(),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  contentHash: z.string(),
  text: z.string(),
});

const citationSchema = z.union([
  z.object({ kind: z.literal('span'), span: spanSchema }),
  z.object({ kind: z.literal('claim'), ref: z.object({ nodeId: z.string(), claimId: z.string() }) }),
]);

const claimSchema = z.object({
  id: z.string(),
  text: z.string(),
  citations: z.array(citationSchema),
  verdict: z.enum(['VERIFIED', 'STALE', 'OUT_OF_CORPUS', 'UNGROUNDED']).optional(),
  faithfulness: z.enum(['supported', 'unsupported', 'unchecked']).optional(),
});

const nodeSchema = z.object({
  id: z.string(),
  kind: z.enum(['leaf', 'dir', 'root']),
  path: z.string(),
  title: z.string(),
  summary: z.string(),
  claims: z.array(claimSchema),
  childIds: z.array(z.string()),
  sourceHash: z.string().optional(),
  builtWith: z.enum(['llm', 'extractive']),
  provider: z.string().optional(),
  builtAt: z.string(),
});

export const treeSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  root: z.string(),
  nodes: z.record(z.string(), nodeSchema),
  corpusFiles: z.record(z.string(), z.object({ hash: z.string(), lines: z.number().int() })),
  builtAt: z.string(),
  generator: z.string(),
});

export const treePath = (root: string): string => join(root, '.overstory', 'tree.json');
export const partialPath = (root: string): string => join(root, '.overstory', 'tree.partial.json');

/** Atomic save: write temp then rename, so a killed build never corrupts the tree. */
export const saveTree = async (path: string, tree: Tree): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(tree), 'utf8');
  await rename(tmp, path);
};

/** Load + schema-validate. Returns null when missing or invalid (caller decides whether
 * that means "build needed" — a corrupt tree is never trusted). */
export const loadTree = async (path: string): Promise<Tree | null> => {
  try {
    const raw = await readFile(path, 'utf8');
    return treeSchema.parse(JSON.parse(raw)) as Tree;
  } catch {
    return null;
  }
};
