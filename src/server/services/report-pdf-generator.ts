import { db } from "@/server/db";
import { InvoiceStatus, InvoiceType, type ReportType } from "@/generated/prisma";

export type ReportData = {
  title: string;
  html: string;
  generatedAt: Date;
};

/**
 * Generates report HTML suitable for PDF conversion or email embedding.
 * Each report type queries the same data as the tRPC report procedures.
 */
export async function generateReportHtml(
  orgId: string,
  reportType: ReportType,
  dateRange?: { from?: Date; to?: Date }
): Promise<ReportData> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  const orgName = org?.name ?? "Organization";

  switch (reportType) {
    case "PROFIT_LOSS":
      return generateProfitLossReport(orgId, orgName, dateRange);
    case "AGING":
      return generateAgingReport(orgId, orgName);
    case "UNPAID":
      return generateUnpaidReport(orgId, orgName, dateRange);
    case "EXPENSES":
      return generateExpensesReport(orgId, orgName, dateRange);
    case "TAX_LIABILITY":
      return generateTaxLiabilityReport(orgId, orgName, dateRange);
    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }
}

async function generateProfitLossReport(
  orgId: string,
  orgName: string,
  dateRange?: { from?: Date; to?: Date }
): Promise<ReportData> {
  const dateFilter = dateRange?.from || dateRange?.to
    ? { ...(dateRange.from ? { gte: dateRange.from } : {}), ...(dateRange.to ? { lte: dateRange.to } : {}) }
    : undefined;

  const [payments, expenses] = await Promise.all([
    db.payment.findMany({
      where: { organizationId: orgId, ...(dateFilter ? { paidAt: dateFilter } : {}) },
      select: { amount: true },
    }),
    db.expense.findMany({
      where: { organizationId: orgId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
      select: { rate: true, qty: true },
    }),
  ]);

  const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.rate) * e.qty, 0);
  const netIncome = totalRevenue - totalExpenses;

  const html = `
    <h1>${orgName} - Profit &amp; Loss Report</h1>
    <p>Generated: ${new Date().toLocaleDateString()}</p>
    <table style="width:100%; border-collapse:collapse; margin-top:20px;">
      <tr style="border-bottom:2px solid #000;">
        <th style="text-align:left; padding:8px;">Category</th>
        <th style="text-align:right; padding:8px;">Amount</th>
      </tr>
      <tr><td style="padding:8px;">Total Revenue</td><td style="text-align:right; padding:8px;">$${totalRevenue.toFixed(2)}</td></tr>
      <tr><td style="padding:8px;">Total Expenses</td><td style="text-align:right; padding:8px;">$${totalExpenses.toFixed(2)}</td></tr>
      <tr style="border-top:2px solid #000; font-weight:bold;">
        <td style="padding:8px;">Net Income</td><td style="text-align:right; padding:8px;">$${netIncome.toFixed(2)}</td>
      </tr>
    </table>
  `;

  return { title: "Profit & Loss Report", html, generatedAt: new Date() };
}

async function generateAgingReport(orgId: string, orgName: string): Promise<ReportData> {
  const now = new Date();
  const invoices = await db.invoice.findMany({
    where: {
      organizationId: orgId,
      isArchived: false,
      status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
    },
    include: { client: { select: { name: true } }, currency: true },
    orderBy: { dueDate: "asc" },
  });

  const buckets: Record<string, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const inv of invoices) {
    const days = inv.dueDate ? Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400000) : 0;
    const amount = Number(inv.total);
    if (days <= 0) buckets.current += amount;
    else if (days <= 30) buckets["1-30"] += amount;
    else if (days <= 60) buckets["31-60"] += amount;
    else if (days <= 90) buckets["61-90"] += amount;
    else buckets["90+"] += amount;
  }

  const rows = Object.entries(buckets)
    .map(([k, v]) => `<tr><td style="padding:8px;">${k} days</td><td style="text-align:right; padding:8px;">$${v.toFixed(2)}</td></tr>`)
    .join("");

  const total = Object.values(buckets).reduce((s, v) => s + v, 0);

  const html = `
    <h1>${orgName} - Aging Report</h1>
    <p>Generated: ${now.toLocaleDateString()}</p>
    <table style="width:100%; border-collapse:collapse; margin-top:20px;">
      <tr style="border-bottom:2px solid #000;"><th style="text-align:left; padding:8px;">Bucket</th><th style="text-align:right; padding:8px;">Amount</th></tr>
      ${rows}
      <tr style="border-top:2px solid #000; font-weight:bold;"><td style="padding:8px;">Total</td><td style="text-align:right; padding:8px;">$${total.toFixed(2)}</td></tr>
    </table>
  `;

  return { title: "Invoice Aging Report", html, generatedAt: now };
}

async function generateUnpaidReport(
  orgId: string,
  orgName: string,
  dateRange?: { from?: Date; to?: Date }
): Promise<ReportData> {
  const invoices = await db.invoice.findMany({
    where: {
      organizationId: orgId,
      isArchived: false,
      status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
      ...(dateRange?.from || dateRange?.to
        ? { date: { ...(dateRange.from ? { gte: dateRange.from } : {}), ...(dateRange.to ? { lte: dateRange.to } : {}) } }
        : {}),
    },
    include: { client: { select: { name: true } }, currency: true },
    orderBy: { dueDate: "asc" },
  });

  const rows = invoices.map((inv) => `
    <tr>
      <td style="padding:8px;">#${inv.number}</td>
      <td style="padding:8px;">${inv.client.name}</td>
      <td style="padding:8px;">${inv.status}</td>
      <td style="padding:8px;">${inv.dueDate?.toLocaleDateString() ?? "\u2014"}</td>
      <td style="text-align:right; padding:8px;">$${Number(inv.total).toFixed(2)}</td>
    </tr>
  `).join("");

  const total = invoices.reduce((s, inv) => s + Number(inv.total), 0);

  const html = `
    <h1>${orgName} - Unpaid Invoices Report</h1>
    <p>Generated: ${new Date().toLocaleDateString()} | ${invoices.length} invoices</p>
    <table style="width:100%; border-collapse:collapse; margin-top:20px;">
      <tr style="border-bottom:2px solid #000;">
        <th style="text-align:left; padding:8px;">Invoice</th>
        <th style="text-align:left; padding:8px;">Client</th>
        <th style="text-align:left; padding:8px;">Status</th>
        <th style="text-align:left; padding:8px;">Due Date</th>
        <th style="text-align:right; padding:8px;">Amount</th>
      </tr>
      ${rows}
      <tr style="border-top:2px solid #000; font-weight:bold;">
        <td colspan="4" style="padding:8px;">Total</td>
        <td style="text-align:right; padding:8px;">$${total.toFixed(2)}</td>
      </tr>
    </table>
  `;

  return { title: "Unpaid Invoices Report", html, generatedAt: new Date() };
}

async function generateExpensesReport(
  orgId: string,
  orgName: string,
  dateRange?: { from?: Date; to?: Date }
): Promise<ReportData> {
  const expenses = await db.expense.findMany({
    where: {
      organizationId: orgId,
      ...(dateRange?.from || dateRange?.to
        ? { createdAt: { ...(dateRange.from ? { gte: dateRange.from } : {}), ...(dateRange.to ? { lte: dateRange.to } : {}) } }
        : {}),
    },
    include: { category: true, supplier: true },
    orderBy: { createdAt: "desc" },
  });

  const rows = expenses.map((e) => `
    <tr>
      <td style="padding:8px;">${e.name}</td>
      <td style="padding:8px;">${e.category?.name ?? "\u2014"}</td>
      <td style="padding:8px;">${e.supplier?.name ?? "\u2014"}</td>
      <td style="text-align:right; padding:8px;">$${(Number(e.rate) * e.qty).toFixed(2)}</td>
    </tr>
  `).join("");

  const total = expenses.reduce((s, e) => s + Number(e.rate) * e.qty, 0);

  const html = `
    <h1>${orgName} - Expenses Report</h1>
    <p>Generated: ${new Date().toLocaleDateString()} | ${expenses.length} expenses</p>
    <table style="width:100%; border-collapse:collapse; margin-top:20px;">
      <tr style="border-bottom:2px solid #000;">
        <th style="text-align:left; padding:8px;">Name</th>
        <th style="text-align:left; padding:8px;">Category</th>
        <th style="text-align:left; padding:8px;">Supplier</th>
        <th style="text-align:right; padding:8px;">Amount</th>
      </tr>
      ${rows}
      <tr style="border-top:2px solid #000; font-weight:bold;">
        <td colspan="3" style="padding:8px;">Total</td>
        <td style="text-align:right; padding:8px;">$${total.toFixed(2)}</td>
      </tr>
    </table>
  `;

  return { title: "Expenses Report", html, generatedAt: new Date() };
}

async function generateTaxLiabilityReport(
  orgId: string,
  orgName: string,
  dateRange?: { from?: Date; to?: Date }
): Promise<ReportData> {
  const lineTaxes = await db.invoiceLineTax.findMany({
    where: {
      invoiceLine: {
        invoice: {
          organizationId: orgId,
          isArchived: false,
          status: { notIn: ["DRAFT"] },
          type: { not: InvoiceType.CREDIT_NOTE },
          ...(dateRange?.from || dateRange?.to
            ? { date: { ...(dateRange.from ? { gte: dateRange.from } : {}), ...(dateRange.to ? { lte: dateRange.to } : {}) } }
            : {}),
        },
      },
    },
    include: { tax: true },
  });

  const byTax = new Map<string, { name: string; rate: number; total: number }>();
  for (const lt of lineTaxes) {
    const key = lt.taxId;
    if (!byTax.has(key)) byTax.set(key, { name: lt.tax.name, rate: Number(lt.tax.rate), total: 0 });
    byTax.get(key)!.total += Number(lt.taxAmount);
  }

  const rows = Array.from(byTax.values())
    .sort((a, b) => b.total - a.total)
    .map((t) => `<tr><td style="padding:8px;">${t.name} (${t.rate}%)</td><td style="text-align:right; padding:8px;">$${t.total.toFixed(2)}</td></tr>`)
    .join("");

  const grandTotal = Array.from(byTax.values()).reduce((s, t) => s + t.total, 0);

  const html = `
    <h1>${orgName} - Tax Liability Report</h1>
    <p>Generated: ${new Date().toLocaleDateString()}</p>
    <table style="width:100%; border-collapse:collapse; margin-top:20px;">
      <tr style="border-bottom:2px solid #000;"><th style="text-align:left; padding:8px;">Tax</th><th style="text-align:right; padding:8px;">Collected</th></tr>
      ${rows}
      <tr style="border-top:2px solid #000; font-weight:bold;"><td style="padding:8px;">Grand Total</td><td style="text-align:right; padding:8px;">$${grandTotal.toFixed(2)}</td></tr>
    </table>
  `;

  return { title: "Tax Liability Report", html, generatedAt: new Date() };
}
