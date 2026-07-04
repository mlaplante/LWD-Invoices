import { cache } from "react";
import type { PrismaClient } from "@/generated/prisma";

/**
 * Accounts-receivable reporting: point-in-time AR aging and a Days-Sales-
 * Outstanding (DSO) trend. Both are pure reporting over existing invoice +
 * payment data — no new columns. The core math lives in exported helpers so it
 * can be unit-tested without a database.
 */

// ── Aging buckets ──────────────────────────────────────────────────────────────

export type AgingBucketKey = "current" | "d1_30" | "d31_60" | "d61_90" | "d90plus";

export const AGING_BUCKETS: { key: AgingBucketKey; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "d1_30", label: "1–30 days" },
  { key: "d31_60", label: "31–60 days" },
  { key: "d61_90", label: "61–90 days" },
  { key: "d90plus", label: "90+ days" },
];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Standard AR aging buckets keyed by days past the due date. */
export function bucketForDaysPastDue(days: number): AgingBucketKey {
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90plus";
}

/** Whole calendar days between two dates (UTC midnight), positive when `later` is after `earlier`. */
export function daysBetween(later: Date, earlier: Date): number {
  const a = Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate());
  const b = Date.UTC(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate());
  return Math.floor((a - b) / 86_400_000);
}

/**
 * Outstanding balance of one invoice as of a point in time: gross total minus
 * payments received on or before `asOf`, floored at zero (overpayments don't
 * create negative receivables).
 */
export function outstandingAsOf(
  total: number,
  payments: { amount: number; paidAt: Date }[],
  asOf: Date,
): number {
  const paid = payments.reduce(
    (s, p) => (p.paidAt.getTime() <= asOf.getTime() ? s + p.amount : s),
    0,
  );
  const balance = total - paid;
  return balance > 0 ? balance : 0;
}

/**
 * Days Sales Outstanding: receivables expressed as days of sales, using the
 * trailing-window average daily sales as the denominator. Using a 365-day
 * window (rather than a single month) keeps the metric stable when one month
 * happens to have little or no billing. Returns 0 when there are no sales.
 */
export function computeDso(arAtEnd: number, trailingSales: number, windowDays = 365): number {
  if (trailingSales <= 0) return 0;
  const avgDailySales = trailingSales / windowDays;
  return avgDailySales > 0 ? arAtEnd / avgDailySales : 0;
}

// ── Data fetch ──────────────────────────────────────────────────────────────────

type ReceivableInvoice = {
  id: string;
  number: string;
  date: Date;
  dueDate: Date | null;
  total: number;
  clientName: string;
  currencySymbol: string;
  payments: { amount: number; paidAt: Date }[];
};

/**
 * All invoices that represent receivables: real sales invoices (SIMPLE /
 * DETAILED) that left DRAFT. Fully-paid ones are kept here and naturally net to
 * a zero balance at any as-of date — important for historical point-in-time
 * reconstruction in the DSO trend.
 */
// React cache(): arAging and dsoTrend render on the same DSO board (and batch
// into one tRPC request), so this org-wide scan runs once per request, not once
// per procedure.
const fetchReceivables = cache(async (db: PrismaClient, orgId: string): Promise<ReceivableInvoice[]> => {
  const invoices = await db.invoice.findMany({
    where: {
      organizationId: orgId,
      isArchived: false,
      type: { in: ["SIMPLE", "DETAILED"] },
      status: { not: "DRAFT" },
    },
    select: {
      id: true,
      number: true,
      date: true,
      dueDate: true,
      total: true,
      client: { select: { name: true } },
      currency: { select: { symbol: true } },
      payments: { select: { amount: true, paidAt: true } },
    },
  });

  return invoices.map((i) => ({
    id: i.id,
    number: i.number,
    date: i.date,
    dueDate: i.dueDate,
    total: Number(i.total),
    clientName: i.client.name,
    currencySymbol: i.currency.symbol,
    payments: i.payments.map((p) => ({ amount: Number(p.amount), paidAt: p.paidAt })),
  }));
});

// ── AR aging (point-in-time) ────────────────────────────────────────────────────

export type AgingRow = {
  invoiceId: string;
  number: string;
  clientName: string;
  dueDate: Date | null;
  balance: number;
  daysPastDue: number;
  bucket: AgingBucketKey;
  currencySymbol: string;
};

export type ArAging = {
  asOf: Date;
  totalAR: number;
  buckets: Record<AgingBucketKey, { total: number; count: number; rows: AgingRow[] }>;
};

function emptyBuckets(): ArAging["buckets"] {
  return {
    current: { total: 0, count: 0, rows: [] },
    d1_30: { total: 0, count: 0, rows: [] },
    d31_60: { total: 0, count: 0, rows: [] },
    d61_90: { total: 0, count: 0, rows: [] },
    d90plus: { total: 0, count: 0, rows: [] },
  };
}

/**
 * AR aging as of a given date, bucketed by outstanding balance (net of payments
 * received by `asOf`). Point-in-time: works for "now" (dashboard) and for a
 * past fiscal year-end (year-end pack) alike.
 */
export async function getArAgingAsOf(
  db: PrismaClient,
  orgId: string,
  asOf: Date = new Date(),
): Promise<ArAging> {
  const receivables = await fetchReceivables(db, orgId);
  const buckets = emptyBuckets();
  let totalAR = 0;

  for (const inv of receivables) {
    if (inv.date.getTime() > asOf.getTime()) continue; // not yet issued at asOf
    const balance = outstandingAsOf(inv.total, inv.payments, asOf);
    if (balance <= 0.005) continue;

    const daysPastDue = inv.dueDate ? daysBetween(asOf, inv.dueDate) : 0;
    const bucket = bucketForDaysPastDue(daysPastDue);
    buckets[bucket].rows.push({
      invoiceId: inv.id,
      number: inv.number,
      clientName: inv.clientName,
      dueDate: inv.dueDate,
      balance,
      daysPastDue,
      bucket,
      currencySymbol: inv.currencySymbol,
    });
    buckets[bucket].total += balance;
    buckets[bucket].count += 1;
    totalAR += balance;
  }

  for (const { key } of AGING_BUCKETS) {
    buckets[key].rows.sort((a, b) => b.daysPastDue - a.daysPastDue);
  }

  return { asOf, totalAR, buckets };
}

// ── DSO trend ────────────────────────────────────────────────────────────────────

export type DsoPoint = { month: string; label: string; ar: number; dso: number };

/** Last instant (ms) of the given UTC month. Month index may overflow/underflow. */
function monthEndUTC(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex + 1, 1) - 1);
}

/**
 * DSO at each of the last `months` month-ends. For each month-end we reconstruct
 * the AR balance and the trailing-365-day sales, then express AR as days of
 * sales (see computeDso).
 */
export async function getDsoTrend(
  db: PrismaClient,
  orgId: string,
  months = 12,
  asOf: Date = new Date(),
): Promise<DsoPoint[]> {
  const receivables = await fetchReceivables(db, orgId);
  const points: DsoPoint[] = [];
  const baseYear = asOf.getUTCFullYear();
  const baseMonth = asOf.getUTCMonth();

  for (let i = months - 1; i >= 0; i--) {
    const end = monthEndUTC(baseYear, baseMonth - i);
    const endMs = end.getTime();
    const windowStart = endMs - 365 * 86_400_000;

    let ar = 0;
    let trailingSales = 0;
    for (const inv of receivables) {
      if (inv.date.getTime() > endMs) continue;
      ar += outstandingAsOf(inv.total, inv.payments, end);
      if (inv.date.getTime() > windowStart) trailingSales += inv.total;
    }

    points.push({
      month: `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}`,
      label: MONTH_NAMES[end.getUTCMonth()],
      ar,
      dso: computeDso(ar, trailingSales),
    });
  }

  return points;
}
