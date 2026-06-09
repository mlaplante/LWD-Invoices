import type { PrismaClient } from "@/generated/prisma";

export type PaymentWithLines = {
  invoiceId: string;
  amount: number;
  invoiceTotal: number;
  lines: { name: string; subtotal: number }[];
};

export type IncomeRow = {
  category: string;
  amount: number;
  pct: number; // percent of total income 0..100
  invoiceCount: number;
};

export type IncomeByCategoryResult = {
  rows: IncomeRow[];
  total: number;
};

function normalizeName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : "Uncategorized";
}

/**
 * Cash-basis income grouped by invoice-line name. Each payment is prorated
 * across its invoice's lines by the line's pre-tax `subtotal` (NOT `total`) so
 * the figure excludes sales tax, which is reported separately as tax liability.
 */
export function attributeIncomeByCategory(
  payments: PaymentWithLines[],
): IncomeByCategoryResult {
  const amounts = new Map<string, number>();
  const invoices = new Map<string, Set<string>>();

  for (const p of payments) {
    if (p.invoiceTotal <= 0) continue;
    const ratio = p.amount / p.invoiceTotal;
    for (const line of p.lines) {
      const key = normalizeName(line.name);
      const attributed = ratio * line.subtotal;
      if (attributed === 0) continue;
      amounts.set(key, (amounts.get(key) ?? 0) + attributed);
      if (!invoices.has(key)) invoices.set(key, new Set());
      invoices.get(key)!.add(p.invoiceId);
    }
  }

  const total = Array.from(amounts.values()).reduce((s, v) => s + v, 0);

  const rows: IncomeRow[] = Array.from(amounts.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      pct: total > 0 ? (amount / total) * 100 : 0,
      invoiceCount: invoices.get(category)?.size ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { rows, total };
}

type DateRange = { from?: Date; to?: Date };

export async function getIncomeByCategory(
  db: PrismaClient,
  orgId: string,
  range: DateRange,
): Promise<IncomeByCategoryResult> {
  const dateFilter =
    range.from || range.to
      ? {
          ...(range.from ? { gte: range.from } : {}),
          ...(range.to ? { lte: range.to } : {}),
        }
      : undefined;

  const payments = await db.payment.findMany({
    where: {
      organizationId: orgId,
      ...(dateFilter ? { paidAt: dateFilter } : {}),
    },
    select: {
      amount: true,
      invoiceId: true,
      invoice: {
        select: {
          total: true,
          lines: { select: { name: true, subtotal: true } },
        },
      },
    },
  });

  return attributeIncomeByCategory(
    payments.map((p) => ({
      invoiceId: p.invoiceId,
      amount: Number(p.amount),
      invoiceTotal: Number(p.invoice.total),
      lines: p.invoice.lines.map((l) => ({
        name: l.name,
        subtotal: Number(l.subtotal),
      })),
    })),
  );
}
