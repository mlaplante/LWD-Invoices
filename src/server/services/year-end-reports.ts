import type { PrismaClient } from "@/generated/prisma";
import { getArAgingAsOf, AGING_BUCKETS } from "./ar-reports";

// ── Types ────────────────────────────────────────────────────────────────────

export type PLRow = {
  month: string;
  revenue: number;
  expenses: number;
  net: number;
};

export type ExpenseRow = {
  date: string;
  name: string;
  supplier: string;
  category: string;
  description: string;
  amount: number;
  tax: string;
};

export type PaymentRow = {
  date: string;
  client: string;
  invoiceNumber: string;
  amount: number;
  method: string;
  gatewayFee: number;
};

export type TaxRow = {
  taxName: string;
  rate: number;
  totalCollected: number;
  invoiceCount: number;
};

export type AgingSnapshotRow = {
  number: string;
  client: string;
  dueDate: string;
  bucket: string;
  daysOverdue: number;
  balance: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function yearRange(year: number) {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  return { from, to };
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ── Profit & Loss ────────────────────────────────────────────────────────────

export async function getProfitAndLoss(
  db: PrismaClient,
  orgId: string,
  year: number,
): Promise<PLRow[]> {
  const { from, to } = yearRange(year);

  const [payments, expenses] = await Promise.all([
    db.payment.findMany({
      where: { organizationId: orgId, paidAt: { gte: from, lt: to } },
      select: { amount: true, paidAt: true },
    }),
    db.expense.findMany({
      where: { organizationId: orgId, createdAt: { gte: from, lt: to } },
      select: { rate: true, qty: true, createdAt: true },
    }),
  ]);

  // Initialise buckets
  const rev = new Array<number>(12).fill(0);
  const exp = new Array<number>(12).fill(0);

  for (const p of payments) {
    const m = p.paidAt.getUTCMonth();
    rev[m] += Number(p.amount);
  }

  for (const e of expenses) {
    const m = e.createdAt.getUTCMonth();
    exp[m] += Number(e.rate) * e.qty;
  }

  return Array.from({ length: 12 }, (_, i) => ({
    month: `${MONTH_LABELS[i]} ${year}`,
    revenue: rev[i],
    expenses: exp[i],
    net: rev[i] - exp[i],
  }));
}

// ── Expense Ledger ───────────────────────────────────────────────────────────

export async function getExpenseLedger(
  db: PrismaClient,
  orgId: string,
  year: number,
): Promise<ExpenseRow[]> {
  const { from, to } = yearRange(year);

  const rows = await db.expense.findMany({
    where: { organizationId: orgId, createdAt: { gte: from, lt: to } },
    include: {
      category: { select: { name: true } },
      supplier: { select: { name: true } },
      tax: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((r) => ({
    date: r.createdAt.toISOString().slice(0, 10),
    name: r.name,
    supplier: r.supplier?.name ?? "",
    category: r.category?.name ?? "",
    description: r.description ?? "",
    amount: Number(r.rate) * r.qty,
    tax: r.tax?.name ?? "",
  }));
}

// ── Payment Ledger ───────────────────────────────────────────────────────────

export async function getPaymentLedger(
  db: PrismaClient,
  orgId: string,
  year: number,
): Promise<PaymentRow[]> {
  const { from, to } = yearRange(year);

  const rows = await db.payment.findMany({
    where: { organizationId: orgId, paidAt: { gte: from, lt: to } },
    include: {
      invoice: {
        select: {
          number: true,
          client: { select: { name: true } },
        },
      },
    },
    orderBy: { paidAt: "asc" },
  });

  return rows.map((r) => ({
    date: r.paidAt.toISOString().slice(0, 10),
    client: r.invoice.client.name,
    invoiceNumber: r.invoice.number,
    amount: Number(r.amount),
    method: r.method,
    gatewayFee: Number(r.gatewayFee),
  }));
}

// ── Tax Liability ────────────────────────────────────────────────────────────

export async function getTaxLiability(
  db: PrismaClient,
  orgId: string,
  year: number,
): Promise<TaxRow[]> {
  const { from, to } = yearRange(year);

  const lineTaxes = await db.invoiceLineTax.findMany({
    where: {
      invoiceLine: {
        invoice: {
          organizationId: orgId,
          date: { gte: from, lt: to },
          status: { in: ["SENT", "PAID", "PARTIALLY_PAID", "OVERDUE"] },
          type: { not: "CREDIT_NOTE" },
        },
      },
    },
    select: {
      taxAmount: true,
      tax: { select: { name: true, rate: true } },
      invoiceLine: { select: { invoiceId: true } },
    },
  });

  // Group by tax name
  const map = new Map<
    string,
    { rate: number; total: number; invoiceIds: Set<string> }
  >();

  for (const lt of lineTaxes) {
    const key = lt.tax.name;
    let entry = map.get(key);
    if (!entry) {
      entry = { rate: Number(lt.tax.rate), total: 0, invoiceIds: new Set() };
      map.set(key, entry);
    }
    entry.total += Number(lt.taxAmount);
    entry.invoiceIds.add(lt.invoiceLine.invoiceId);
  }

  return Array.from(map.entries()).map(([taxName, v]) => ({
    taxName,
    rate: v.rate,
    totalCollected: v.total,
    invoiceCount: v.invoiceIds.size,
  }));
}

// ── AR Aging Snapshot (as of year-end) ─────────────────────────────────────────

export async function getArAgingSnapshot(
  db: PrismaClient,
  orgId: string,
  year: number,
): Promise<AgingSnapshotRow[]> {
  // Point-in-time as of the last instant of December 31 that year.
  const asOf = new Date(Date.UTC(year + 1, 0, 1) - 1);
  const aging = await getArAgingAsOf(db, orgId, asOf);
  const bucketLabel = Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, b.label]));

  const rows: AgingSnapshotRow[] = [];
  for (const { key } of AGING_BUCKETS) {
    for (const r of aging.buckets[key].rows) {
      rows.push({
        number: r.number,
        client: r.clientName,
        dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : "",
        bucket: bucketLabel[key],
        daysOverdue: r.daysPastDue > 0 ? r.daysPastDue : 0,
        balance: r.balance,
      });
    }
  }
  return rows;
}
