#!/usr/bin/env node
// Applies prisma/perf-indexes.sql using node-postgres.
// CREATE INDEX CONCURRENTLY can't run in a transaction, so we fire one
// statement at a time on a single non-transactional connection.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Build a session-mode pooler URL (port 5432, no pgbouncer flag) so we can run
// CREATE INDEX CONCURRENTLY without needing IPv6-only direct host access.
function buildSessionPoolerUrl() {
  const base = process.env.DATABASE_URL;
  if (!base) return null;
  const u = new URL(base);
  if (u.hostname.includes("pooler.supabase.com")) {
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

const statements = raw
  .split(/;\s*\n/)
  .map((s) => s.replace(/--.*$/gm, "").trim())
  .filter((s) => s.length > 0 && !/^\s*$/.test(s));

const client = new pg.Client({ connectionString: url });
await client.connect();

let ok = 0;
let skipped = 0;
let failed = 0;
for (const stmt of statements) {
  const label = (stmt.match(/"[A-Za-z]+_[A-Za-z0-9_]+_idx"/)?.[0] || stmt.slice(0, 60));
  try {
    const t0 = Date.now();
    await client.query(stmt);
    const ms = Date.now() - t0;
    console.log(`✓ ${label} (${ms}ms)`);
    ok++;
  } catch (err) {
    if (/already exists/.test(err.message)) {
      console.log(`· ${label} already exists`);
      skipped++;
    } else {
      console.error(`✗ ${label}: ${err.message}`);
      failed++;
    }
  }
}

await client.end();
console.log(`\nDone. created=${ok} skipped=${skipped} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
