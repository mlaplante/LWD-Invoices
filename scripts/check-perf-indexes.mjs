#!/usr/bin/env node
// Verifies that every index in prisma/perf-indexes.sql exists AND is valid in
// the target database. CREATE INDEX CONCURRENTLY leaves an INVALID index
// behind when it fails mid-build, so mere existence isn't enough — an invalid
// index is never used by the planner and must be dropped and re-created.
//
// Run against production:  node scripts/check-perf-indexes.mjs
// (uses DATABASE_URL / DIRECT_DATABASE_URL from .env, same as apply-perf-indexes)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Same session-mode pooler rewrite as apply-perf-indexes.mjs.
function buildSessionPoolerUrl() {
  const base = process.env.DATABASE_URL;
  if (!base) return null;
  const u = new URL(base);
  if (u.hostname === "pooler.supabase.com" || u.hostname.endsWith(".pooler.supabase.com")) {
    u.port = "5432";
    u.searchParams.delete("pgbouncer");
    u.searchParams.delete("pool_timeout");
    u.searchParams.delete("connection_limit");
    return u.toString();
  }
  return base;
}

const url = buildSessionPoolerUrl() || process.env.DIRECT_DATABASE_URL;
if (!url) {
  console.error("Missing DATABASE_URL / DIRECT_DATABASE_URL");
  process.exit(1);
}
console.log(`Connecting via: ${url.replace(/:\/\/[^@]+@/, "://USER:PASS@")}`);

const sqlPath = path.join(__dirname, "..", "prisma", "perf-indexes.sql");
const raw = readFileSync(sqlPath, "utf8");

// Every statement in perf-indexes.sql names its index explicitly.
const expected = [...raw.matchAll(/CREATE INDEX CONCURRENTLY IF NOT EXISTS "([^"]+)"/g)].map(
  (m) => m[1],
);
if (expected.length === 0) {
  console.error("No index names found in prisma/perf-indexes.sql");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const { rows } = await client.query(
  `SELECT c.relname AS name, i.indisvalid AS valid
   FROM pg_class c
   JOIN pg_index i ON i.indexrelid = c.oid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
  [expected],
);
await client.end();

const found = new Map(rows.map((r) => [r.name, r.valid]));
let present = 0;
let invalid = 0;
let missing = 0;
for (const name of expected) {
  if (!found.has(name)) {
    console.error(`✗ MISSING  ${name}`);
    missing++;
  } else if (!found.get(name)) {
    console.error(`✗ INVALID  ${name} (failed CONCURRENTLY build — drop and re-create)`);
    invalid++;
  } else {
    console.log(`✓ ${name}`);
    present++;
  }
}

console.log(`\nChecked ${expected.length}: present=${present} invalid=${invalid} missing=${missing}`);
if (missing + invalid > 0) {
  console.log("Fix: node scripts/apply-perf-indexes.mjs (drop any INVALID indexes first)");
}
process.exit(missing + invalid > 0 ? 1 : 0);
