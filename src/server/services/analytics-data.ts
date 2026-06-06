/**
 * Shared data-loading for the analytics surfaces and the books assistant.
 *
 * The analytics router and the AI assistant both need the same Prisma
 * aggregates (per-client payment stats, email engagement, forecast inputs,
 * recurring-revenue streams). Centralizing the builders here keeps the two
 * callers in sync and avoids duplicating the N+1-avoiding bulk queries.
 */

import { InvoiceStatus, type Prisma } from "@/generated/prisma";
import type { db as Db } from "../db";
import type { ClientHealthInput } from "./client-health-score";
import type { CashFlowForecastInput, ForecastFrequency } from "./cash-flow-forecast";
import type { RecurringRevenueStream, RecurringStreamFrequency } from "./subscription-metrics";
import type { AnomalyExpense } from "./expense-anomaly";
import type { CollectionRiskInput } from "./collection-risk";

export const OPEN_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

const DAY_MS = 86_400_000;

type Numeric = Prisma.Decimal | number | string | null | undefined;

export function toNum(value: Numeric): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value) || 0;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export interface ClientStats {
  clientId: string;
  clientName: string;
  paidInvoiceCount: number;
  onTimeInvoiceCount: number;
  totalDaysLate: number;
  recentRevenue: number;
  priorRevenue: number;
  lastActivity: number | null;
  overdueOpenCount: number;
  overdueOpenAmount: number;
}

type InvoiceForStats = {
  id: string;
  clientId: string;
  status: InvoiceStatus;
  total: Prisma.Decimal;
  dueDate: Date | null;
  date: Date;
  client: { id: string; name: string };
  payments: { amount: Prisma.Decimal; paidAt: Date }[];
};

export function aggregateClientStats(
  invoices: InvoiceForStats[],
  now: Date,
): Map<string, ClientStats> {
  const ninetyAgo = now.getTime() - 90 * DAY_MS;
  const oneEightyAgo = now.getTime() - 180 * DAY_MS;
  const byClient = new Map<string, ClientStats>();

  const ensure = (clientId: string, name: string): ClientStats => {
    let s = byClient.get(clientId);
    if (!s) {
      s = {
        clientId,
        clientName: name,
        paidInvoiceCount: 0,
        onTimeInvoiceCount: 0,
        totalDaysLate: 0,
        recentRevenue: 0,
        priorRevenue: 0,
        lastActivity: null,
        overdueOpenCount: 0,
        overdueOpenAmount: 0,
      };
      byClient.set(clientId, s);
    }
    return s;
  };

  for (const inv of invoices) {
    const s = ensure(inv.clientId, inv.client.name);
    s.lastActivity = Math.max(s.lastActivity ?? 0, inv.date.getTime());

    const paidAmount = inv.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
    for (const p of inv.payments) {
      const t = p.paidAt.getTime();
      if (t >= ninetyAgo) s.recentRevenue += toNum(p.amount);
      else if (t >= oneEightyAgo) s.priorRevenue += toNum(p.amount);
      s.lastActivity = Math.max(s.lastActivity ?? 0, t);
    }

    if (inv.status === InvoiceStatus.PAID && inv.dueDate && inv.payments.length > 0) {
      s.paidInvoiceCount++;
      const lastPaidAt = inv.payments.reduce(
        (latest, p) => (p.paidAt > latest ? p.paidAt : latest),
        inv.payments[0].paidAt,
      );
      const daysLate = Math.max(0, Math.round((utcDay(lastPaidAt) - utcDay(inv.dueDate)) / DAY_MS));
      if (daysLate === 0) s.onTimeInvoiceCount++;
      s.totalDaysLate += daysLate;
    }

    if (OPEN_STATUSES.includes(inv.status)) {
      const balance = toNum(inv.total) - paidAmount;
      const overdue = inv.status === InvoiceStatus.OVERDUE || (inv.dueDate !== null && inv.dueDate < now);
      if (overdue && balance > 0) {
        s.overdueOpenCount++;
        s.overdueOpenAmount += balance;
      }
    }
  }

  return byClient;
}

export interface InvoiceEngagement {
  emailed: boolean;
  opened: boolean;
  clicked: boolean;
}

export async function loadInvoiceEngagement(
  db: typeof Db,
  orgId: string,
): Promise<Map<string, InvoiceEngagement>> {
  const events = await db.emailEvent.findMany({
    where: { organizationId: orgId, invoiceId: { not: null } },
    select: { invoiceId: true, type: true },
  });
  const map = new Map<string, InvoiceEngagement>();
  for (const e of events) {
    if (!e.invoiceId) continue;
    const entry = map.get(e.invoiceId) ?? { emailed: false, opened: false, clicked: false };
    entry.emailed = true;
    if (e.type === "email.opened") entry.opened = true;
    if (e.type === "email.clicked") entry.clicked = true;
    map.set(e.invoiceId, entry);
  }
  return map;
}

// ─── Input builders ──────────────────────────────────────────────────────────

export async function buildClientHealthInputs(
  db: typeof Db,
  orgId: string,
  now: Date,
): Promise<ClientHealthInput[]> {
  const [invoices, engagement] = await Promise.all([
    db.invoice.findMany({
      where: { organizationId: orgId, isArchived: false },
      select: {
        id: true,
        clientId: true,
        status: true,
        total: true,
        dueDate: true,
        date: true,
        client: { select: { id: true, name: true } },
        payments: { select: { amount: true, paidAt: true } },
      },
    }),
    loadInvoiceEngagement(db, orgId),
  ]);

  const stats = aggregateClientStats(invoices, now);

  const engagementByClient = new Map<string, { sent: number; opened: number; clicked: number }>();
  for (const inv of invoices) {
    const e = engagement.get(inv.id);
    if (!e?.emailed) continue;
    const c = engagementByClient.get(inv.clientId) ?? { sent: 0, opened: 0, clicked: 0 };
    c.sent++;
    if (e.opened) c.opened++;
    if (e.clicked) c.clicked++;
    engagementByClient.set(inv.clientId, c);
  }

  return Array.from(stats.values()).map((s) => {
    const eng = engagementByClient.get(s.clientId) ?? { sent: 0, opened: 0, clicked: 0 };
    return {
      clientId: s.clientId,
      clientName: s.clientName,
      paidInvoiceCount: s.paidInvoiceCount,
      onTimeInvoiceCount: s.onTimeInvoiceCount,
      averageDaysLate: s.paidInvoiceCount > 0 ? s.totalDaysLate / s.paidInvoiceCount : 0,
      overdueOpenCount: s.overdueOpenCount,
      overdueOpenAmount: s.overdueOpenAmount,
      emailsSent: eng.sent,
      emailsOpened: eng.opened,
      emailsClicked: eng.clicked,
      recentRevenue: s.recentRevenue,
      priorRevenue: s.priorRevenue,
      daysSinceLastActivity:
        s.lastActivity === null ? null : Math.round((now.getTime() - s.lastActivity) / DAY_MS),
    };
  });
}

export async function buildCashFlowForecastInput(
  db: typeof Db,
  orgId: string,
  startingCash?: number,
): Promise<CashFlowForecastInput> {
  const [openInvoices, recurringInvoices, recurringExpenses] = await Promise.all([
    db.invoice.findMany({
      where: { organizationId: orgId, isArchived: false, status: { in: OPEN_STATUSES } },
      select: {
        id: true,
        total: true,
        dueDate: true,
        client: { select: { id: true, name: true } },
        payments: { select: { amount: true } },
      },
    }),
    db.recurringInvoice.findMany({
      where: { organizationId: orgId, isActive: true },
      select: {
        frequency: true,
        interval: true,
        nextRunAt: true,
        endDate: true,
        maxOccurrences: true,
        occurrenceCount: true,
        autoCharge: true,
        invoice: { select: { total: true, client: { select: { defaultPaymentTermsDays: true } } } },
      },
    }),
    db.recurringExpense.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { rate: true, qty: true, frequency: true, interval: true, nextRunAt: true, endDate: true },
    }),
  ]);

  return {
    startingCash,
    openInvoices: openInvoices.map((inv) => ({
      id: inv.id,
      clientId: inv.client.id,
      clientName: inv.client.name,
      balance: toNum(inv.total) - inv.payments.reduce((s, p) => s + toNum(p.amount), 0),
      dueDate: inv.dueDate,
    })),
    recurringInvoices: recurringInvoices.map((rec) => ({
      amount: toNum(rec.invoice.total),
      autoCharge: rec.autoCharge,
      nextRunAt: rec.nextRunAt,
      frequency: rec.frequency as ForecastFrequency,
      interval: rec.interval,
      endDate: rec.endDate,
      maxOccurrences: rec.maxOccurrences,
      occurrenceCount: rec.occurrenceCount,
      paymentTermsDays: rec.invoice.client.defaultPaymentTermsDays,
    })),
    recurringExpenses: recurringExpenses.map((exp) => ({
      amount: toNum(exp.rate) * exp.qty,
      nextRunAt: exp.nextRunAt,
      frequency: exp.frequency as ForecastFrequency,
      interval: exp.interval,
      endDate: exp.endDate,
    })),
  };
}

export async function buildSubscriptionStreams(
  db: typeof Db,
  orgId: string,
): Promise<RecurringRevenueStream[]> {
  const [recurringInvoices, hoursRetainers] = await Promise.all([
    db.recurringInvoice.findMany({
      where: { organizationId: orgId },
      select: {
        isActive: true,
        frequency: true,
        interval: true,
        startDate: true,
        endDate: true,
        invoice: { select: { total: true, clientId: true } },
      },
    }),
    db.hoursRetainer.findMany({
      where: { organizationId: orgId },
      select: {
        active: true,
        clientId: true,
        includedHours: true,
        hourlyRate: true,
        createdAt: true,
      },
    }),
  ]);

  const streams: RecurringRevenueStream[] = [];
  for (const rec of recurringInvoices) {
    streams.push({
      clientId: rec.invoice.clientId,
      kind: "recurring_invoice",
      amount: toNum(rec.invoice.total),
      frequency: rec.frequency as RecurringStreamFrequency,
      interval: rec.interval,
      startDate: rec.startDate,
      endDate: rec.endDate,
      isActive: rec.isActive,
    });
  }
  for (const hr of hoursRetainers) {
    const rate = toNum(hr.hourlyRate);
    if (rate <= 0) continue;
    streams.push({
      clientId: hr.clientId,
      kind: "hours_retainer",
      amount: toNum(hr.includedHours) * rate,
      frequency: "MONTHLY",
      interval: 1,
      startDate: hr.createdAt,
      endDate: null,
      isActive: hr.active,
    });
  }
  return streams;
}

export async function buildExpenseAnomalyInputs(
  db: typeof Db,
  orgId: string,
  lookbackDays = 365,
): Promise<AnomalyExpense[]> {
  const since = new Date(Date.now() - lookbackDays * DAY_MS);
  const expenses = await db.expense.findMany({
    where: { organizationId: orgId, createdAt: { gte: since } },
    select: {
      id: true,
      name: true,
      rate: true,
      qty: true,
      createdAt: true,
      dueDate: true,
      supplierId: true,
      supplier: { select: { name: true } },
    },
  });

  return expenses.map((e) => {
    const supplierName = e.supplier?.name ?? "Uncategorized supplier";
    return {
      id: e.id,
      supplierKey: e.supplierId ?? `name:${supplierName.toLowerCase()}`,
      supplierName,
      amount: toNum(e.rate) * e.qty,
      date: e.dueDate ?? e.createdAt,
      description: e.name,
    };
  });
}

export async function buildCollectionRiskInputs(
  db: typeof Db,
  orgId: string,
  now: Date,
  reliablePayerThreshold: number,
): Promise<CollectionRiskInput[]> {
  const [allInvoices, engagement, reminderCounts] = await Promise.all([
    db.invoice.findMany({
      where: { organizationId: orgId, isArchived: false },
      select: {
        id: true,
        number: true,
        clientId: true,
        status: true,
        total: true,
        dueDate: true,
        date: true,
        client: { select: { id: true, name: true } },
        payments: { select: { amount: true, paidAt: true } },
      },
    }),
    loadInvoiceEngagement(db, orgId),
    db.reminderLog.groupBy({
      by: ["invoiceId"],
      where: { invoice: { organizationId: orgId } },
      _count: { _all: true },
    }),
  ]);

  const stats = aggregateClientStats(allInvoices, now);
  const reminderByInvoice = new Map(reminderCounts.map((r) => [r.invoiceId, r._count._all]));

  return allInvoices
    .filter((inv) => OPEN_STATUSES.includes(inv.status))
    .map((inv) => {
      const paid = inv.payments.reduce((s, p) => s + toNum(p.amount), 0);
      const balance = toNum(inv.total) - paid;
      const s = stats.get(inv.clientId);
      const onTimePercent =
        s && s.paidInvoiceCount >= 3
          ? Math.round((s.onTimeInvoiceCount / s.paidInvoiceCount) * 100)
          : null;
      const avgDaysLate = s && s.paidInvoiceCount > 0 ? s.totalDaysLate / s.paidInvoiceCount : 0;
      const eng = engagement.get(inv.id);
      const daysUntilDue = inv.dueDate
        ? Math.round((utcDay(inv.dueDate) - utcDay(now)) / DAY_MS)
        : 0;
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        clientId: inv.client.id,
        clientName: inv.client.name,
        balance,
        daysUntilDue,
        clientOnTimePercent: onTimePercent,
        clientAvgDaysLate: avgDaysLate,
        isReliablePayer: onTimePercent !== null && onTimePercent >= reliablePayerThreshold,
        remindersSent: reminderByInvoice.get(inv.id) ?? 0,
        invoiceOpened: eng?.opened ?? false,
        invoiceClicked: eng?.clicked ?? false,
      };
    })
    .filter((i) => i.balance > 0);
}
