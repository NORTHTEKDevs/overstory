import { and, eq } from 'drizzle-orm';
import { getDb, repos, trees } from './db.js';
import type { Tree } from './engine.js';

export interface StoredTree {
  tree: Tree;
  commitSha: string;
  builtWith: string;
  claims: number;
  verified: number;
  freshness: number;
  publishedAt: Date;
  lastVerifiedAt: Date;
  lastFreshness: number;
}

export const getStoredTree = async (owner: string, name: string): Promise<StoredTree | null> => {
  const db = getDb();
  if (!db) return null;
  const repo = await db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, name))).limit(1);
  if (repo.length === 0) return null;
  const row = await db.select().from(trees).where(eq(trees.repoId, repo[0].id)).limit(1);
  if (row.length === 0) return null;
  const r = row[0];
  return {
    tree: JSON.parse(r.treeJson) as Tree,
    commitSha: r.commitSha,
    builtWith: r.builtWith,
    claims: r.claims,
    verified: r.verified,
    freshness: r.freshness,
    publishedAt: r.publishedAt,
    lastVerifiedAt: r.lastVerifiedAt,
    lastFreshness: r.lastFreshness,
  };
};

export const saveTree = async (
  owner: string,
  name: string,
  data: { tree: Tree; commitSha: string; builtWith: string; claims: number; verified: number; freshness: number },
): Promise<boolean> => {
  const db = getDb();
  if (!db) return false;
  const existing = await db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, name))).limit(1);
  const repoId = existing.length > 0 ? existing[0].id : (await db.insert(repos).values({ owner, name }).returning({ id: repos.id }))[0].id;
  const payload = {
    repoId,
    ref: 'HEAD',
    commitSha: data.commitSha,
    treeJson: JSON.stringify(data.tree),
    builtWith: data.builtWith,
    claims: data.claims,
    verified: data.verified,
    freshness: data.freshness,
    publishedAt: new Date(),
    lastVerifiedAt: new Date(),
    lastFreshness: data.freshness,
  };
  const current = await db.select({ id: trees.id }).from(trees).where(eq(trees.repoId, repoId)).limit(1);
  if (current.length > 0) await db.update(trees).set(payload).where(eq(trees.id, current[0].id));
  else await db.insert(trees).values(payload);
  return true;
};

export const recordReverify = async (owner: string, name: string, freshness: number): Promise<void> => {
  const db = getDb();
  if (!db) return;
  const repo = await db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, name))).limit(1);
  if (repo.length === 0) return;
  await db.update(trees).set({ lastVerifiedAt: new Date(), lastFreshness: freshness }).where(eq(trees.repoId, repo[0].id));
};

/** Per-instance limiter: honest-but-simple v1 (CDN caching + size caps do the heavy
 * lifting; a DB-backed counter is the v1.1 upgrade). */
const hits = new Map<string, { count: number; windowStart: number }>();
export const rateLimit = (key: string, max = 10, windowMs = 3_600_000): boolean => {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    hits.set(key, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
};
