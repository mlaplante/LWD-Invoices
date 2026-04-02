import type { PLRow, ExpenseRow, PaymentRow, TaxRow } from "./year-end-reports";

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(value: string | number | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function money(n: number): string {
  return n.toFixed(2);
}

// ── Profit & Loss ────────────────────────────────────────────────────────────

export function plToCsv(rows: PLRow[]): string {
  const header = "Month,Revenue,Expenses,Net";
  const lines = rows.map(
    (r) => `${esc(r.month)},${money(r.revenue)},${money(r.expenses)},${money(r.net)}`,
  );

  // Totals row
  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      expenses: acc.expenses + r.expenses,
      net: acc.net + r.net,
    }),
    { revenue: 0, expenses: 0, net: 0 },
  );
  lines.push(`Total,${money(totals.revenue)},${money(totals.expenses)},${money(totals.net)}`);

  return [header, ...lines].join("\n");
}

// ── Expense Ledger ───────────────────────────────────────────────────────────

export function expensesToCsv(rows: ExpenseRow[]): string {
  const header = "Date,Name,Supplier,Category,Description,Amount,Tax";
  const lines = rows.map(
    (r) =>
      [
        esc(r.date),
        esc(r.name),
        esc(r.supplier),
        esc(r.category),
        esc(r.description),
        money(r.amount),
        esc(r.tax),
      ].join(","),
  );
  return [header, ...lines].join("\n");
}

// ── Payment Ledger ───────────────────────────────────────────────────────────

export function paymentsToCsv(rows: PaymentRow[]): string {
  const header = "Date,Client,Invoice Number,Amount,Method,Gateway Fee";
  const lines = rows.map(
    (r) =>
      [
        esc(r.date),
        esc(r.client),
        esc(r.invoiceNumber),
        money(r.amount),
        esc(r.method),
        money(r.gatewayFee),
      ].join(","),
  );
  return [header, ...lines].join("\n");
}

// ── Tax Liability ────────────────────────────────────────────────────────────

export function taxToCsv(rows: TaxRow[]): string {
  const header = "Tax Name,Rate (%),Total Collected,Invoice Count";
  const lines = rows.map(
    (r) =>
      [esc(r.taxName), money(r.rate), money(r.totalCollected), r.invoiceCount].join(","),
  );
  return [header, ...lines].join("\n");
}
