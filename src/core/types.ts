export type Verdict = 'VERIFIED' | 'STALE' | 'OUT_OF_CORPUS' | 'UNGROUNDED';

/** A contiguous source span. Stores its normalized text so receipts stay
 * renderable without the repo present and citations can self-heal when code moves. */
export interface SpanRef {
  file: string; // posix-style path relative to corpus root
  startLine: number; // 1-based, inclusive
  endLine: number; // inclusive
  contentHash: string; // sha256 of normalized span text
  text: string; // normalized span text
}

export interface NodeClaimRef {
  nodeId: string;
  claimId: string;
}

export type Citation =
  | { kind: 'span'; span: SpanRef }
  | { kind: 'claim'; ref: NodeClaimRef };

/** Semantic disclosure tier, set at build time. `supported`: the Reflexion critique
 * confirmed the cited lines support the claim text. `unsupported`: the critique flagged a
 * mismatch. `unchecked`: no critique ran (budget-capped or provider failure) — honest
 * default, never upgraded silently. Extractive claims are supported-by-construction. */
export type Faithfulness = 'supported' | 'unsupported' | 'unchecked';

export interface Claim {
  id: string;
  text: string;
  citations: Citation[];
  verdict?: Verdict;
  faithfulness?: Faithfulness;
}

export interface TreeNode {
  id: string;
  kind: 'leaf' | 'dir' | 'root';
  path: string; // file path for leaves, dir path for dirs, '' for root
  title: string;
  summary: string; // one-paragraph prose rendering (claims are the source of truth)
  claims: Claim[];
  childIds: string[];
  sourceHash?: string; // leaves: sha256 of the normalized file content summarized
  builtWith: 'llm' | 'extractive';
  provider?: string;
  builtAt: string; // ISO timestamp
}

export interface CorpusFileMeta {
  hash: string; // sha256 of normalized full content
  lines: number;
}

export interface Tree {
  version: 1;
  name: string;
  root: string; // root node id
  nodes: Record<string, TreeNode>;
  corpusFiles: Record<string, CorpusFileMeta>; // state at build time
  /** Corpus options the tree was built with. Verification MUST reuse these — verifying
   * against a differently-scoped corpus produces wrong verdicts, not conservative ones. */
  corpusOptions?: { include?: string[]; maxFiles?: number };
  builtAt: string;
  generator: string; // e.g. "@northtek/overstory@0.1.0"
}

/** Live view of the corpus used by the gate at verification time. */
export interface CorpusSnapshot {
  root: string;
  files: Map<string, { hash: string; lines: string[] }>;
}

export interface SpanVerification {
  verdict: Extract<Verdict, 'VERIFIED' | 'STALE' | 'OUT_OF_CORPUS'>;
  /** Present when the span text was found at a new location (code moved). */
  healed?: { startLine: number; endLine: number };
}

export interface ClaimVerification {
  claimId: string;
  verdict: Verdict;
  spans: SpanVerification[];
}

export interface TreeVerification {
  verdicts: Map<string, Verdict>; // claimId -> verdict
  details: Map<string, ClaimVerification>; // claimId -> full result (incl. heals)
  byNode: Map<string, { verified: number; total: number }>;
  /** Fraction of claims VERIFIED across the whole tree, 0..1. */
  freshness: number;
}
