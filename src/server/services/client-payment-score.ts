import type { PrismaClient } from "@/generated/prisma";

const MIN_INVOICES = 3;

/**
 * Client payment-score helpers.
 *
 * Consumers:
 * - app/(dashboard)/clients/[id]/page.tsx: surfaces on-time % on the
 *   client detail header so the team can see at a glance whether a
 *   client pays late.
 * - inngest/functions/reminder-sequences.ts: gates pre-due reminders
 *   on isReliablePayer, so chronically on-time clients don't get
 *   nagged before the invoice is due.
 *
 * MIN_INVOICES guards against a single anomaly tilting the score —
 * clients with fewer than 3 paid invoices return null (insufficient
 * data) and the UI/reminder logic falls back to the neutral default.
 */

/**
 * Calculates the percentage of a client's invoices paid on or before due date.
 * Returns null if fewer than MIN_INVOICES paid invoices (not enough data).
 */
export async function getClientOnTimePercent(
  db: PrismaClient,
  clientId: string
): Promise<number | null> {
  const paidInvoices = await db.invoice.findMany({
    where: {
      clientId,
      status: "PAID",
      dueDate: { not: null },
    },
    select: {
      dueDate: true,
      payments: {
        select: { paidAt: true },
        orderBy: { paidAt: "desc" },
        take: 1,
      },
    },
  });

  if (paidInvoices.length < MIN_INVOICES) return null;

  let onTime = 0;
  for (const inv of paidInvoices) {
    if (!inv.dueDate || inv.payments.length === 0) continue;
    const lastPayment = inv.payments[0];
    const dueDay = Date.UTC(
      inv.dueDate.getUTCFullYear(),
      inv.dueDate.getUTCMonth(),
      inv.dueDate.getUTCDate()
    );
    const paidDay = Date.UTC(
      lastPayment.paidAt.getUTCFullYear(),
      lastPayment.paidAt.getUTCMonth(),
      lastPayment.paidAt.getUTCDate()
    );
    if (paidDay <= dueDay) onTime++;
  }

  return Math.round((onTime / paidInvoices.length) * 100);
}

/**
 * Returns true if client qualifies for skipping pre-due reminders.
 */
export async function isReliablePayer(
  db: PrismaClient,
  clientId: string,
  threshold: number
): Promise<boolean> {
  const percent = await getClientOnTimePercent(db, clientId);
  if (percent === null) return false;
  return percent >= threshold;
}

export interface ClientPaymentBehaviorSummary {
  paidInvoiceCount: number;
  onTimePercent: number | null;
  lateInvoiceCount: number;
}

// True when a paid invoice's last payment landed on or before its due date
// (UTC day granularity). Shared by the single- and bulk-client summaries so
// the on-time rule stays in one place.
function isPaidOnTime(dueDate: Date, paidAt: Date): boolean {
  const dueDay = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const paidDay = Date.UTC(paidAt.getUTCFullYear(), paidAt.getUTCMonth(), paidAt.getUTCDate());
  return paidDay <= dueDay;
}

function summarizeTally(count: number, onTime: number, late: number): ClientPaymentBehaviorSummary {
  if (count < MIN_INVOICES) {
    return { paidInvoiceCount: count, onTimePercent: null, lateInvoiceCount: 0 };
  }
  return {
    paidInvoiceCount: count,
    onTimePercent: Math.round((onTime / count) * 100),
    lateInvoiceCount: late,
  };
}

export async function getClientPaymentBehaviorSummary(
  db: PrismaClient,
  clientId: string
): Promise<ClientPaymentBehaviorSummary> {
  const summaries = await getClientPaymentBehaviorSummaries(db, [clientId]);
  return summaries.get(clientId) ?? { paidInvoiceCount: 0, onTimePercent: null, lateInvoiceCount: 0 };
}

/**
 * Bulk variant of getClientPaymentBehaviorSummary: one query for all requested
 * clients instead of one per client. Used by the collections queue, which scores
 * many open invoices that share a handful of clients. Returns a map keyed by
 * clientId; clients with no paid invoices are still present (zeroed) so callers
 * can look up every id unconditionally.
 */
export async function getClientPaymentBehaviorSummaries(
  db: PrismaClient,
  clientIds: string[]
): Promise<Map<string, ClientPaymentBehaviorSummary>> {
  const result = new Map<string, ClientPaymentBehaviorSummary>();
  const uniqueIds = [...new Set(clientIds)];
  if (uniqueIds.length === 0) return result;

  const paidInvoices = await db.invoice.findMany({
    where: {
      clientId: { in: uniqueIds },
      status: "PAID",
      dueDate: { not: null },
    },
    select: {
      clientId: true,
      dueDate: true,
      payments: {
        select: { paidAt: true },
        orderBy: { paidAt: "desc" },
        take: 1,
      },
    },
  });

  // count = every paid invoice (matches the single-client divisor); onTime/late
  // only tally rows that actually have a payment, exactly as the original did.
  const tally = new Map<string, { count: number; onTime: number; late: number }>();
  for (const inv of paidInvoices) {
    const t = tally.get(inv.clientId) ?? { count: 0, onTime: 0, late: 0 };
    t.count++;
    if (inv.dueDate && inv.payments.length > 0) {
      if (isPaidOnTime(inv.dueDate, inv.payments[0].paidAt)) t.onTime++;
      else t.late++;
    }
    tally.set(inv.clientId, t);
  }

  for (const id of uniqueIds) {
    const t = tally.get(id);
    result.set(id, t ? summarizeTally(t.count, t.onTime, t.late) : { paidInvoiceCount: 0, onTimePercent: null, lateInvoiceCount: 0 });
  }
  return result;
}
