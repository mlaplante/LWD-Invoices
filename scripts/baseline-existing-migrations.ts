/**
 * One-shot recovery script: bulk-marks all historical migrations as applied
 * in _prisma_migrations without re-running their SQL.
 *
 * Use case: production DB schema was built outside the migration system
 * (or by an older Prisma run that never recorded entries), so
 * `prisma migrate deploy` keeps trying to re-apply migrations whose objects
 * already exist. This script computes each migration.sql's SHA-256 checksum
 * and inserts a properly-formed row, matching what `prisma migrate resolve
 * --applied <name>` would do — but for all of them at once.
 *
 * SAFE TO RE-RUN: skips migrations already tracked.
 *
 * IMPORTANT: only mark as applied migrations whose SQL effects are ALREADY
 * present in the database. By default this script skips today's new
 * migrations (date prefix in SKIP_PREFIXES) so they run normally on the
 * next deploy. Add prefixes for any other migrations you want left for
 * `prisma migrate deploy` to handle.
 *
 * Usage:
 *   DIRECT_DATABASE_URL='<session pooler url>' npx tsx scripts/baseline-existing-migrations.ts
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { Client } from "pg";
import { join } from "node:path";

// Migrations to leave alone (will be applied normally on next deploy).
const SKIP_PREFIXES = [
  "20260509", // notification snooze, email events, stripe tax foundation, stripe tax txn id
];

const MIGRATIONS_DIR = "prisma/migrations";

async function main() {
  const url = process.env.DIRECT_DATABASE_URL;
  if (!url) {
    console.error("Set DIRECT_DATABASE_URL to the Supabase session pooler URL.");
    process.exit(1);
  }

  const dirs = readdirSync(MIGRATIONS_DIR)
    .filter((d) => {
      const full = join(MIGRATIONS_DIR, d);
      try {
        return statSync(full).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();

  const targets = dirs.filter((d) => !SKIP_PREFIXES.some((p) => d.startsWith(p)));
  const skipped = dirs.filter((d) => SKIP_PREFIXES.some((p) => d.startsWith(p)));

  console.log(`Found ${dirs.length} migration directories.`);
  console.log(`Will baseline ${targets.length} as applied.`);
  console.log(`Skipping ${skipped.length} (left for migrate deploy):`);
  for (const s of skipped) console.log(`  - ${s}`);

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const existing = await client.query<{ migration_name: string }>(
      `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`,
    );
    const appliedSet = new Set(existing.rows.map((r) => r.migration_name));

    let marked = 0;
    let already = 0;

    for (const name of targets) {
      if (appliedSet.has(name)) {
        already++;
        continue;
      }

      const sqlPath = join(MIGRATIONS_DIR, name, "migration.sql");
      const sql = readFileSync(sqlPath, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");

      // Clean any half-finished row from a prior failed attempt.
      await client.query(
        `DELETE FROM _prisma_migrations WHERE migration_name = $1 AND finished_at IS NULL`,
        [name],
      );

      await client.query(
        `INSERT INTO _prisma_migrations
           (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
         VALUES ($1, $2, NOW(), $3, NOW(), 1)`,
        [randomUUID(), checksum, name],
      );

      marked++;
      console.log(`  ✓ ${name}`);
    }

    console.log(`\nDone. Marked ${marked} as applied; ${already} were already tracked.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
