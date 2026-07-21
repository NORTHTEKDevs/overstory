import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { integer, pgTable, real, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const repos = pgTable(
  'repos',
  {
    id: serial('id').primaryKey(),
    owner: text('owner').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('repos_owner_name').on(t.owner, t.name)],
);

export const trees = pgTable('trees', {
  id: serial('id').primaryKey(),
  repoId: integer('repo_id').notNull(),
  ref: text('ref').notNull(),
  commitSha: text('commit_sha').notNull(),
  treeJson: text('tree_json').notNull(),
  builtWith: text('built_with').notNull(), // 'extractive' | 'llm:<model>'
  claims: integer('claims').notNull(),
  verified: integer('verified').notNull(),
  freshness: real('freshness').notNull(),
  publishedAt: timestamp('published_at').defaultNow().notNull(),
  lastVerifiedAt: timestamp('last_verified_at').defaultNow().notNull(),
  lastFreshness: real('last_freshness').notNull(),
});

/** Null when DATABASE_URL is absent — the registry then runs stateless (instant trees
 * with CDN caching work; publish honestly refuses). */
export const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return drizzle(neon(url), { schema: { repos, trees } });
};

export type Db = NonNullable<ReturnType<typeof getDb>>;
