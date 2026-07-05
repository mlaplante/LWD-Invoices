#!/usr/bin/env -S npx tsx
/**
 * Phase 0 / Phase 3 baseline: aggregate cash-flow forecast accuracy + BIAS
 * across ALL organizations' matured ForecastSnapshot rows.
 *
 * Why this script exists: `analytics.forecastAccuracy`
 * (src/server/routers/analytics.ts) is a protectedProcedure — it only ever
 * reports one org's history (ctx.orgId-scoped, by design: non-negotiable #1).
 * There is no cross-org aggregate endpoint. A campaign-level baseline needs
 * the system-wide number, so this reads the DB directly (read-only SELECT)
 * and reuses the exact same pure grading functions the app uses
 * (src/server/services/forecast-accuracy.ts), so the numbers it prints are
 * guaranteed to match what the product would show for the same rows.
 *
 * Read money-intelligence-campaign/SKILL.md Phase 0 before running this.
 *
 * Usage (read-only; safe against a production replica or the session pooler):
 *   DIRECT_DATABASE_URL='<supabase session-pooler URL>' \
 *     npx tsx .claude/skills/money-intelligence-campaign/scripts/baseline-accuracy.ts
 *
 * Falls back to DATABASE_URL if DIRECT_DATABASE_URL isn't set. Either is fine
 * for a SELECT; DIRECT_DATABASE_URL matters for prisma migrate (DDL), not here.
 *
 * This script only ever SELECTs. It never writes to ForecastSnapshot or any
 * other table — non-negotiable #2 territory (migrations/DB writes) does not
 * apply, but treat the connection string itself with the same care as any
 * other production credential (non-negotiable / lwd-security-and-secrets).
 */
import { Client } from "pg";
import { summarizeAccuracy, type ScoredSnapshot } from "../../../../src/server/services/forecast-accuracy";

// Below this many matured (scored) snapshots system-wide, treat any
// meanBiasPct/meanAccuracy number as noise, not a diagnosis. This is a
// generic minimum-sample heuristic, NOT a constant defined anywhere in the
// codebase — recheck it against your own confidence needs before citing it.
const MIN_SAMPLES_FOR_SIGNAL = 30;

async function main() {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DIRECT_DATABASE_URL (or DATABASE_URL) to a Postgres connection string.");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const { rows: scoredRows } = await client.query<{
      capturedat: Date;
      horizondays: number;
      projectedinflow: string;
      actualinflow: string | null;
    }>(
      `SELECT "capturedAt" AS capturedat, "horizonDays" AS horizondays,
              "projectedInflow" AS projectedinflow, "actualInflow" AS actualinflow
       FROM "ForecastSnapshot"
       WHERE "scoredAt" IS NOT NULL`,
    );

    const { rows: pendingRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "ForecastSnapshot" WHERE "scoredAt" IS NULL`,
    );
    const { rows: totalRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "ForecastSnapshot"`,
    );

    const scored: ScoredSnapshot[] = scoredRows.map((r) => ({
      capturedAt: r.capturedat,
      horizonDays: r.horizondays,
      projectedInflow: Number(r.projectedinflow),
      actualInflow: Number(r.actualinflow ?? 0),
    }));

    const summary = summarizeAccuracy(scored);

    console.log(`Total ForecastSnapshot rows: ${totalRows[0]?.count ?? 0}`);
    console.log(`Matured (scored) rows: ${scored.length}`);
    console.log(`Still-pending (unmatured) rows: ${pendingRows[0]?.count ?? 0}`);
    console.log(`Overall accuracy (0-100, all horizons pooled): ${summary.overallAccuracy ?? "n/a"}`);
    console.log("Per-horizon:");
    for (const h of summary.horizons) {
      console.log(
        `  horizon=${h.horizonDays}d  n=${h.sampleCount}  meanAccuracy=${h.meanAccuracy}  ` +
          `meanBiasPct=${h.meanBiasPct} (negative = over-forecasting: you collect less than projected)  ` +
          `direction=${h.biasDirection}`,
      );
    }

    if (scored.length < MIN_SAMPLES_FOR_SIGNAL) {
      console.log(
        `\nFewer than ${MIN_SAMPLES_FOR_SIGNAL} matured snapshots system-wide — treat the numbers ` +
          "above as too noisy to diagnose or promote against. See SKILL.md Phase 0's " +
          "'accumulate history first' branch before doing anything else.",
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
