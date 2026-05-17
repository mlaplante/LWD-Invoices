import { z } from "zod";
import { router, requireRole } from "../trpc";

/**
 * Bulk-export router. Returns CSV strings for invoices, clients, and
 * expenses scoped to the caller's org plus an optional date range. The
 * year-end report exports already exist as a separate flow; this is for
 * arbitrary-range pulls (accounting handoff, data archaeology, etc.).
 *
 * CSV escaping is intentionally minimal but RFC 4180-correct: any cell
 * containing ", \n, or \r is wrapped in double quotes, with embedded
 * quotes doubled.
 */

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object" && "toNumber" in (value as object)
      ? String((value as { toNumber(): number }).toNumber())
      : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

function buildCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(","), ...rows.map(csvRow)].join("\r\n");
}

// Soft cap on rows per export. A row of ~12 fields serializes to ~500 bytes,
// so 5000 rows ≈ 2.5 MB CSV — safely under serverless response-size limits
// and well under what Excel/Google Sheets opens without complaint. Hitting
// the cap returns a `truncated: true` flag so the UI can warn the user and
// suggest narrowing the date range or using the year-end report flow.
const EXPORT_ROW_CAP = 5000;

const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const exportsRouter = router({
  invoicesCSV: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const invoices = await ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.from || input.to
            ? { date: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
            : {}),
        },
        select: {
          number: true,
          status: true,
          type: true,
          date: true,
          dueDate: true,
          subtotal: true,
          taxTotal: true,
          total: true,
          client: { select: { name: true, email: true } },
          currency: { select: { code: true } },
        },
        orderBy: { date: "desc" },
        // Fetch one extra row so we can detect truncation without a separate
        // count() round-trip.
        take: EXPORT_ROW_CAP + 1,
      });
      const truncated = invoices.length > EXPORT_ROW_CAP;
      const rows = truncated ? invoices.slice(0, EXPORT_ROW_CAP) : invoices;
      const csv = buildCsv(
        ["Number", "Status", "Type", "Date", "Due Date", "Client", "Email", "Currency", "Subtotal", "Tax", "Total"],
        rows.map((i) => [
          i.number,
          i.status,
          i.type,
          i.date,
          i.dueDate,
          i.client.name,
          i.client.email,
          i.currency.code,
          i.subtotal,
          i.taxTotal,
          i.total,
        ]),
      );
      return { csv, count: rows.length, truncated, cap: EXPORT_ROW_CAP };
    }),

  clientsCSV: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .query(async ({ ctx }) => {
      const clients = await ctx.db.client.findMany({
        where: { organizationId: ctx.orgId, isArchived: false },
        select: {
          name: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          state: true,
          zip: true,
          country: true,
          taxId: true,
          createdAt: true,
        },
        orderBy: { name: "asc" },
        take: EXPORT_ROW_CAP + 1,
      });
      const truncated = clients.length > EXPORT_ROW_CAP;
      const rows = truncated ? clients.slice(0, EXPORT_ROW_CAP) : clients;
      const csv = buildCsv(
        ["Name", "Email", "Phone", "Address", "City", "State", "ZIP", "Country", "Tax ID", "Created"],
        rows.map((c) => [
          c.name, c.email, c.phone, c.address, c.city, c.state, c.zip, c.country, c.taxId, c.createdAt,
        ]),
      );
      return { csv, count: rows.length, truncated, cap: EXPORT_ROW_CAP };
    }),

  expensesCSV: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const expenses = await ctx.db.expense.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.from || input.to
            ? { createdAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
            : {}),
        },
        select: {
          name: true,
          description: true,
          qty: true,
          rate: true,
          paidAt: true,
          dueDate: true,
          reimbursable: true,
          category: { select: { name: true } },
          supplier: { select: { name: true } },
          project: { select: { name: true } },
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: EXPORT_ROW_CAP + 1,
      });
      const truncated = expenses.length > EXPORT_ROW_CAP;
      const rows = truncated ? expenses.slice(0, EXPORT_ROW_CAP) : expenses;
      const csv = buildCsv(
        ["Name", "Description", "Qty", "Rate", "Category", "Supplier", "Project", "Reimbursable", "Paid At", "Due Date", "Created"],
        rows.map((e) => [
          e.name,
          e.description,
          e.qty,
          e.rate,
          e.category?.name,
          e.supplier?.name,
          e.project?.name,
          e.reimbursable,
          e.paidAt,
          e.dueDate,
          e.createdAt,
        ]),
      );
      return { csv, count: rows.length, truncated, cap: EXPORT_ROW_CAP };
    }),
});
