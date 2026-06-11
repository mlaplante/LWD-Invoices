import { inngest } from "../client";
import { db } from "@/server/db";
import { buildCashFlowForecastInput } from "@/server/services/analytics-data";
import { projectCashFlow } from "@/server/services/cash-flow-forecast";

const CONCURRENCY = 10;
const HORIZONS = [30, 60, 90];
const DAY_MS = 86_400_000;

/**
 * Weekly forecast snapshot + scoring pass (Monday 5am UTC, before the weekly
 * briefing). Two halves:
 *
 * 1. SCORE — snapshots whose horizon has closed get `actualInflow` filled
 *    with the payments actually received in [capturedAt, matureAt] and are
 *    stamped `scoredAt`. This is what makes the Money Intelligence forecast
 *    self-validating.
 * 2. CAPTURE — every org with open AR or recurring revenue gets fresh
 *    30/60/90-day snapshots of the same projection the hub displays.
 */
export const processForecastSnapshots = inngest.createFunction(
  {
    id: "process-forecast-snapshots",
    name: "Process Forecast Snapshots",
    triggers: [{ cron: "0 5 * * 1" }],
  },
  async () => {
    const now = new Date();

    // ── 1. Score matured snapshots ────────────────────────────────────────
    const matured = await db.forecastSnapshot.findMany({
      where: { scoredAt: null, matureAt: { lte: now } },
      select: { id: true, organizationId: true, capturedAt: true, matureAt: true },
      take: 2000,
    });

    let scored = 0;
    for (let i = 0; i < matured.length; i += CONCURRENCY) {
      const batch = matured.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (snap) => {
          const inflow = await db.payment.aggregate({
            where: {
              organizationId: snap.organizationId,
              paidAt: { gte: snap.capturedAt, lte: snap.matureAt },
            },
            _sum: { amount: true },
          });
          await db.forecastSnapshot.update({
            where: { id: snap.id },
            data: {
              actualInflow: inflow._sum.amount ?? 0,
              scoredAt: now,
            },
          });
          scored++;
        }),
      );
    }

    // ── 2. Capture fresh snapshots ────────────────────────────────────────
    const orgs = await db.organization.findMany({ select: { id: true } });

    let captured = 0;
    const failures: string[] = [];
    for (let i = 0; i < orgs.length; i += CONCURRENCY) {
      const batch = orgs.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (org) => {
          try {
            const input = await buildCashFlowForecastInput(db, org.id);
            const hasSignal =
              input.openInvoices.length > 0 || input.recurringInvoices.length > 0;
            if (!hasSignal) return; // nothing to forecast — skip the noise rows

            const forecast = projectCashFlow(input, { now, horizons: HORIZONS });
            await db.forecastSnapshot.createMany({
              data: forecast.horizons.map((h) => ({
                organizationId: org.id,
                capturedAt: now,
                horizonDays: h.horizonDays,
                matureAt: new Date(now.getTime() + h.horizonDays * DAY_MS),
                projectedInflow: h.projectedInflow,
                projectedOutflow: h.projectedOutflow,
                confidence: h.confidence,
              })),
            });
            captured += forecast.horizons.length;
          } catch (err) {
            failures.push(`${org.id}: ${err instanceof Error ? err.message : "failed"}`);
          }
        }),
      );
    }

    return { scored, captured, orgs: orgs.length, failures: failures.length };
  },
);
