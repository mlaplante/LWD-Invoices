/**
 * Cross-tenant aggregation for anonymized benchmarking.
 *
 * This is the one place that reads receivables across *all* organizations — by
 * design, since a benchmark is meaningless within a single tenant. Everything it
 * returns is aggregate and k-anonymized (see benchmarking.ts); no other org's id
 * or raw values ever leave this module. The pure metric math is factored out so
 * it can be unit-tested without a database.
 */

import type { PrismaClient } from "@/generated/prisma";
import { computeDso, daysBetween, outstandingAsOf } from "./ar-reports";
import {
  buildBenchmarkResult,
  revenueBand,
  type BenchmarkResult,
  type OrgBenchmarkMetric,
  type RevenueBand,
} from "./benchmarking";

const YEAR_MS = 365 * 86_400_000;

export interface BenchmarkInvoice {
  organizationId: string;
  date: Date;
  dueDate: Date | null;
  total: number;
  payments: { amount: number; paidAt: Date }[];
}

/** Compute one org's benchmark metrics from its receivable invoices. */
export function computeOrgMetric(invoices: BenchmarkInvoice[], now: Date): OrgBenchmarkMetric {
  const windowStart = now.getTime() - YEAR_MS;
  let ar = 0;
  let overdueAr = 0;
  let trailingRevenue = 0;

  for (const inv of invoices) {
    if (inv.date.getTime() > now.getTime()) continue; // not yet issued
    const balance = outstandingAsOf(inv.total, inv.payments, now);
    if (balance > 0.005) {
      ar += balance;
      if (inv.dueDate && daysBetween(now, inv.dueDate) > 0) overdueAr += balance;
    }
    if (inv.date.getTime() > windowStart) trailingRevenue += inv.total;
  }

  return {
    trailingRevenue,
    dso: computeDso(ar, trailingRevenue),
    percentOverdue: ar > 0 ? (overdueAr / ar) * 100 : 0,
  };
}

/** Group flat invoice rows by org and compute each org's metric. */
export function aggregateOrgMetrics(rows: BenchmarkInvoice[], now: Date): Map<string, OrgBenchmarkMetric> {
  const byOrg = new Map<string, BenchmarkInvoice[]>();
  for (const row of rows) {
    const list = byOrg.get(row.organizationId) ?? [];
    list.push(row);
    byOrg.set(row.organizationId, list);
  }
  const metrics = new Map<string, OrgBenchmarkMetric>();
  for (const [orgId, invoices] of byOrg) metrics.set(orgId, computeOrgMetric(invoices, now));
  return metrics;
}

/**
 * Build the benchmark for `orgId` from a precomputed metric map. Pure (no DB) so
 * it's directly testable. Only orgs with trailing revenue are eligible peers, so
 * dormant tenants don't drag the cohort.
 */
export function benchmarkFromMetrics(
  metrics: Map<string, OrgBenchmarkMetric>,
  orgId: string,
): BenchmarkResult {
  const self = metrics.get(orgId);
  if (!self || self.trailingRevenue <= 0) {
    return { available: false, reason: "no_data" };
  }

  const bandKey: RevenueBand = revenueBand(self.trailingRevenue);
  const peerDso: number[] = [];
  const peerOverdue: number[] = [];
  for (const [id, m] of metrics) {
    if (id === orgId) continue;
    if (m.trailingRevenue <= 0) continue;
    if (revenueBand(m.trailingRevenue) !== bandKey) continue;
    peerDso.push(m.dso);
    peerOverdue.push(m.percentOverdue);
  }

  return buildBenchmarkResult({ self, bandKey, peerDso, peerOverdue });
}

/**
 * Fetch every org's receivable invoices and return the anonymized benchmark for
 * the requesting org. The query is intentionally unscoped (cross-tenant); the
 * result is aggregate-only.
 */
export async function getBenchmarksForOrg(
  db: PrismaClient,
  orgId: string,
  now: Date = new Date(),
): Promise<BenchmarkResult> {
  const invoices = await db.invoice.findMany({
    where: {
      isArchived: false,
      type: { in: ["SIMPLE", "DETAILED"] },
      status: { not: "DRAFT" },
    },
    select: {
      organizationId: true,
      date: true,
      dueDate: true,
      total: true,
      payments: { select: { amount: true, paidAt: true } },
    },
  });

  const rows: BenchmarkInvoice[] = invoices.map((i) => ({
    organizationId: i.organizationId,
    date: i.date,
    dueDate: i.dueDate,
    total: Number(i.total),
    payments: i.payments.map((p) => ({ amount: Number(p.amount), paidAt: p.paidAt })),
  }));

  return benchmarkFromMetrics(aggregateOrgMetrics(rows, now), orgId);
}
