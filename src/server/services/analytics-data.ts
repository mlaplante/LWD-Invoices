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
import type { SendObservation } from "./send-timing";

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

/**
 * Build the health-score input for a single client (for the client-detail
 * badge). Queries only that client's invoices + engagement rather than the
 * whole org. Returns null when the client has no invoices to score.
 */
export async function buildClientHealthInputForClient(
  db: typeof Db,
  orgId: string,
  clientId: string,
  now: Date,
): Promise<ClientHealthInput | null> {
  const invoices = await db.invoice.findMany({
    where: { organizationId: orgId, clientId, isArchived: false },
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
  });
  if (invoices.length === 0) return null;

  const stats = aggregateClientStats(invoices, now).get(clientId);
  if (!stats) return null;

  const invoiceIds = invoices.map((inv) => inv.id);
  const events = await db.emailEvent.findMany({
    where: { organizationId: orgId, invoiceId: { in: invoiceIds } },
    select: { invoiceId: true, type: true },
  });
  const perInvoice = new Map<string, { opened: boolean; clicked: boolean }>();
  for (const e of events) {
    if (!e.invoiceId) continue;
    const entry = perInvoice.get(e.invoiceId) ?? { opened: false, clicked: false };
    if (e.type === "email.opened") entry.opened = true;
    if (e.type === "email.clicked") entry.clicked = true;
    perInvoice.set(e.invoiceId, entry);
  }
  let sent = 0;
  let opened = 0;
  let clicked = 0;
  for (const id of invoiceIds) {
    const e = perInvoice.get(id);
    if (!e) continue;
    sent++;
    if (e.opened) opened++;
    if (e.clicked) clicked++;
  }

  return {
    clientId: stats.clientId,
    clientName: stats.clientName,
    paidInvoiceCount: stats.paidInvoiceCount,
    onTimeInvoiceCount: stats.onTimeInvoiceCount,
    averageDaysLate: stats.paidInvoiceCount > 0 ? stats.totalDaysLate / stats.paidInvoiceCount : 0,
    overdueOpenCount: stats.overdueOpenCount,
    overdueOpenAmount: stats.overdueOpenAmount,
    emailsSent: sent,
    emailsOpened: opened,
    emailsClicked: clicked,
    recentRevenue: stats.recentRevenue,
    priorRevenue: stats.priorRevenue,
    daysSinceLastActivity:
      stats.lastActivity === null ? null : Math.round((now.getTime() - stats.lastActivity) / DAY_MS),
  };
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
  const [allInvoices, engagement, reminderCounts, manualReminders, disputeCounts] =
    await Promise.all([
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
      // Sequence reminders (ReminderLog) + ad-hoc reminders (InvoiceReminder):
      // count both toward remindersSent and take the most recent send for recency.
      db.reminderLog.groupBy({
        by: ["invoiceId"],
        where: { invoice: { organizationId: orgId } },
        _count: { _all: true },
        _max: { sentAt: true },
      }),
      db.invoiceReminder.groupBy({
        by: ["invoiceId"],
        where: { organizationId: orgId },
        _count: { _all: true },
        _max: { sentAt: true },
      }),
      // Prior disputes per client, for the payment-probability signal.
      db.dispute.groupBy({
        by: ["clientId"],
        where: { organizationId: orgId, clientId: { not: null } },
        _count: { _all: true },
      }),
    ]);

  const stats = aggregateClientStats(allInvoices, now);

  // Prior-dispute count per client.
  const disputesByClient = new Map<string, number>();
  for (const d of disputeCounts) {
    if (d.clientId) disputesByClient.set(d.clientId, d._count._all);
  }

  // A client's typical invoice amount (median of their invoice totals), used to
  // flag unusually large invoices. Needs at least 3 invoices to be meaningful.
  const amountsByClient = new Map<string, number[]>();
  for (const inv of allInvoices) {
    const bucket = amountsByClient.get(inv.clientId) ?? [];
    bucket.push(toNum(inv.total));
    amountsByClient.set(inv.clientId, bucket);
  }
  const typicalAmountByClient = new Map<string, number>();
  for (const [clientId, amounts] of amountsByClient) {
    if (amounts.length < 3) continue;
    const sorted = [...amounts].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const med =
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    if (med > 0) typicalAmountByClient.set(clientId, med);
  }

  // Merge sequence + manual reminders per invoice: total count and latest sentAt.
  const reminderByInvoice = new Map<string, { count: number; lastSentAt: Date | null }>();
  const mergeReminder = (invoiceId: string, count: number, lastSentAt: Date | null) => {
    const entry = reminderByInvoice.get(invoiceId) ?? { count: 0, lastSentAt: null };
    entry.count += count;
    if (lastSentAt && (!entry.lastSentAt || lastSentAt > entry.lastSentAt)) {
      entry.lastSentAt = lastSentAt;
    }
    reminderByInvoice.set(invoiceId, entry);
  };
  for (const r of reminderCounts) mergeReminder(r.invoiceId, r._count._all, r._max.sentAt);
  for (const r of manualReminders) mergeReminder(r.invoiceId, r._count._all, r._max.sentAt);

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
      const reminders = reminderByInvoice.get(inv.id);
      const daysSinceLastReminder =
        reminders?.lastSentAt != null
          ? Math.max(0, Math.round((utcDay(now) - utcDay(reminders.lastSentAt)) / DAY_MS))
          : null;
      const typicalAmount = typicalAmountByClient.get(inv.clientId);
      const amountVsClientNorm =
        typicalAmount && typicalAmount > 0 ? toNum(inv.total) / typicalAmount : null;
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
        remindersSent: reminders?.count ?? 0,
        daysSinceLastReminder,
        invoiceOpened: eng?.opened ?? false,
        invoiceClicked: eng?.clicked ?? false,
        amountVsClientNorm,
        priorDisputes: disputesByClient.get(inv.clientId) ?? 0,
      };
    })
    .filter((i) => i.balance > 0);
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * Weekday (0–6) and hour (0–23) of a Date in a given IANA time zone. Uses Intl
 * (no extra dependency). "Best day to send" is meaningless in UTC for a user in
 * another zone — a 9pm PST send is the next day in UTC — so we bucket in the
 * org's own time zone.
 */
function partsInTimeZone(date: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  let weekday = 0;
  let hour = 0;
  for (const p of parts) {
    if (p.type === "weekday") weekday = WEEKDAY_INDEX[p.value] ?? 0;
    else if (p.type === "hour") hour = parseInt(p.value, 10) % 24;
  }
  return { weekday, hour };
}

/**
 * Build send-timing observations for a client from EmailEvent history: for each
 * of the client's invoices that was emailed, derive when it was sent (bucketed
 * in the org's time zone) and how quickly it was first opened. Feeds
 * recommendSendWindow.
 */
export async function buildSendObservations(
  db: typeof Db,
  orgId: string,
  clientId: string,
  timeZone: string = "UTC",
): Promise<SendObservation[]> {
  const events = await db.emailEvent.findMany({
    where: {
      organizationId: orgId,
      invoiceId: { not: null },
      invoice: { clientId },
    },
    select: { invoiceId: true, type: true, occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });

  // Per invoice: earliest send time and earliest open time.
  const byInvoice = new Map<string, { sentAt: Date | null; openedAt: Date | null }>();
  for (const e of events) {
    if (!e.invoiceId) continue;
    const entry = byInvoice.get(e.invoiceId) ?? { sentAt: null, openedAt: null };
    const isSend = e.type.includes("sent") || e.type.includes("delivered");
    const isOpen = e.type.includes("opened");
    if (isSend && (!entry.sentAt || e.occurredAt < entry.sentAt)) entry.sentAt = e.occurredAt;
    if (isOpen && (!entry.openedAt || e.occurredAt < entry.openedAt)) entry.openedAt = e.occurredAt;
    byInvoice.set(e.invoiceId, entry);
  }

  const observations: SendObservation[] = [];
  for (const { sentAt, openedAt } of byInvoice.values()) {
    if (!sentAt) continue;
    const hoursToOpen =
      openedAt && openedAt >= sentAt
        ? (openedAt.getTime() - sentAt.getTime()) / 3_600_000
        : null;
    const { weekday, hour } = partsInTimeZone(sentAt, timeZone);
    observations.push({ weekday, hour, hoursToOpen });
  }
  return observations;
}
