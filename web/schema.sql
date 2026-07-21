-- OVERSTORY registry schema (Neon Postgres). Run once:
--   psql "$DATABASE_URL" -f web/schema.sql
-- then add DATABASE_URL to the Vercel project env and redeploy.

CREATE TABLE IF NOT EXISTS repos (
  id SERIAL PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS repos_owner_name ON repos (owner, name);

CREATE TABLE IF NOT EXISTS trees (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repos(id),
  ref TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  tree_json TEXT NOT NULL,
  built_with TEXT NOT NULL,
  claims INTEGER NOT NULL,
  verified INTEGER NOT NULL,
  freshness REAL NOT NULL,
  published_at TIMESTAMP NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMP NOT NULL DEFAULT now(),
  last_freshness REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS trees_repo ON trees (repo_id);
