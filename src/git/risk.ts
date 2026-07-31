import type { Tree, TreeVerification } from '../core/types.js';
import type { FileHistory, HistoryReport } from './history.js';

/**
 * Documentation risk: where active code meets absent or rotting documentation.
 *
 * This is deliberately NOT a defect predictor. It makes no claim to forecast bugs, and it was
 * not fitted to any corpus — presenting a hand-chosen weighting as a validated model would be
 * the exact dishonesty this project exists to avoid. It is a ranking heuristic whose every
 * input is printed alongside the score so you can disagree with it on the evidence.
 *
 * The signal it captures is one nothing else has, because it needs both halves: git knows
 * which files are moving and who moves them; the tree knows which files are described and
 * whether those descriptions still hold. Crossed, they answer a question a maintainer
 * actually has — "what should I document or re-read first?"
 */
export interface RiskRow {
  file: string;
  /** 0..100. Ordering device, not a measurement. */
  score: number;
  /** Every reason that contributed, in plain words, so the number is auditable. */
  reasons: string[];
  commits: number;
  weightedChurn: number;
  authors: number;
  topAuthor: string | null;
  ownershipConcentration: number;
  lastChangedAt: number | null;
  claims: number;
  staleClaims: number;
  documented: boolean;
}

export interface RiskOptions {
  limit?: number;
  now?: number;
}

const leafFor = (tree: Tree, file: string): { claims: number } | null => {
  const node = tree.nodes[`leaf:${file}`];
  if (!node) return null;
  return { claims: (node.claims ?? []).length };
};

/** How many of a leaf's claims failed verification. */
const staleCountFor = (tree: Tree, verification: TreeVerification, file: string): number => {
  const node = tree.nodes[`leaf:${file}`];
  if (!node) return 0;
  let stale = 0;
  for (const claim of node.claims ?? []) {
    const verdict = verification.verdicts.get(claim.id);
    const value = typeof verdict === 'string' ? verdict : (verdict as { verdict?: string } | undefined)?.verdict;
    if (value && value !== 'VERIFIED') stale += 1;
  }
  return stale;
};

/** Rank files by documentation risk. Files absent from history (never committed) are skipped:
 * with no churn there is nothing to be at risk from. */
export const documentationRisk = (
  tree: Tree,
  verification: TreeVerification,
  history: HistoryReport,
  opts: RiskOptions = {},
): RiskRow[] => {
  const limit = opts.limit ?? 20;
  const now = opts.now ?? Date.now();
  if (!history.available) return [];

  // Normalise churn against the busiest file so the score means the same thing on a small
  // repository as on a large one.
  let maxChurn = 0;
  for (const h of history.files.values()) maxChurn = Math.max(maxChurn, h.weightedChurn);
  if (maxChurn <= 0) return [];

  // In a repository with one contributor, "100% of changes by X" is true of everything and
  // therefore tells you nothing. Only treat ownership as a signal when there is a spread to
  // concentrate against.
  const repoAuthors = new Set<string>();
  for (const h of history.files.values()) for (const a of h.authors) repoAuthors.add(a);
  const ownershipIsMeaningful = repoAuthors.size >= 3;

  const rows: RiskRow[] = [];
  for (const [file, h] of history.files) {
    const leaf = leafFor(tree, file);
    // Only files the tree actually covers can have a documentation state worth judging.
    if (!leaf) continue;
    const stale = staleCountFor(tree, verification, file);
    const documented = leaf.claims > 0;

    // The entry condition is a documentation problem, not activity. A busy file whose docs
    // all verify is not at risk — it is just busy, and it belongs under hotspots. Without
    // this the list degenerates into "your most-edited files", which git alone already tells
    // you and which buries the handful of files that genuinely need attention.
    if (stale === 0 && documented) continue;

    const churnShare = h.weightedChurn / maxChurn;
    const reasons: string[] = [];
    let score = 0;

    // A claim that no longer verifies is worse than no claim: it is a confident lie.
    if (stale > 0) {
      score += 45;
      reasons.push(`${stale} of ${leaf.claims} claims no longer verify`);
    } else {
      score += 22;
      reasons.push('no documented symbols');
    }

    // Debt on code nobody touches costs nobody anything; debt on active code costs time.
    score += churnShare * 40;
    if (churnShare > 0.5) reasons.push(`heavily changed (${h.commits} commits, recency-weighted)`);
    else if (churnShare > 0.2) reasons.push(`actively changed (${h.commits} commits)`);
    else if (h.commits > 1) reasons.push(`${h.commits} commits`);

    // One author plus heavy churn is a single point of knowledge failure.
    if (ownershipIsMeaningful && h.ownershipConcentration >= 0.8 && h.commits >= 5) {
      score += 13 * churnShare;
      reasons.push(`${Math.round(h.ownershipConcentration * 100)}% of changes by ${h.topAuthor}`);
    }

    const ageDays = h.lastChangedAt ? (now - h.lastChangedAt * 1000) / 86_400_000 : Infinity;
    if (ageDays < 30 && churnShare > 0.3) {
      score += 8;
      reasons.push('changed within the last month');
    }
    rows.push({
      file,
      score: Math.round(Math.min(100, score)),
      reasons,
      commits: h.commits,
      weightedChurn: h.weightedChurn,
      authors: h.authors.length,
      topAuthor: h.topAuthor,
      ownershipConcentration: h.ownershipConcentration,
      lastChangedAt: h.lastChangedAt,
      claims: leaf.claims,
      staleClaims: stale,
      documented,
    });
  }

  rows.sort((a, b) => b.score - a.score || b.weightedChurn - a.weightedChurn || a.file.localeCompare(b.file));
  return rows.slice(0, limit);
};

/** Restrict history to files that still exist in the corpus.
 *
 * `git log` happily reports on files deleted last week, generated artifacts and vendored
 * lockfiles. Ranking those as "hotspots" is worse than unhelpful — it is confidently wrong
 * about where the work is. `live` is normally the corpus key set. */
const stillPresent = (history: HistoryReport, live?: Set<string>): FileHistory[] =>
  [...history.files.values()].filter((h) => !live || live.has(h.file));

/** Files carrying the most recent change weight, documented or not. */
export const hotspots = (history: HistoryReport, limit = 15, live?: Set<string>): FileHistory[] =>
  stillPresent(history, live)
    .sort((a, b) => b.weightedChurn - a.weightedChurn || b.commits - a.commits || a.file.localeCompare(b.file))
    .slice(0, limit);

/** Files whose knowledge sits with one person.
 *
 * Returns nothing on a repository with fewer than three contributors: there, every file is
 * "100% owned" by the same person and the finding is an artefact of the team size rather
 * than anything about the code. */
export const knowledgeConcentration = (history: HistoryReport, limit = 15, live?: Set<string>): FileHistory[] => {
  const authors = new Set<string>();
  for (const h of history.files.values()) for (const a of h.authors) authors.add(a);
  if (authors.size < 3) return [];
  return stillPresent(history, live)
    .filter((h) => h.commits >= 5 && h.ownershipConcentration >= 0.8)
    .sort((a, b) => b.weightedChurn - a.weightedChurn || a.file.localeCompare(b.file))
    .slice(0, limit);
};
