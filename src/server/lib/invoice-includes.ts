import type { Prisma } from "@/generated/prisma";

/**
 * Full invoice include for PDF generation and email rendering.
 * Used by Inngest functions, API routes, and tRPC procedures.
 */
export const fullInvoiceInclude = {
  client: true,
  currency: true,
  organization: true,
  lines: {
    include: { taxes: { include: { tax: true } } },
    orderBy: { sort: "asc" as const },
  },
  payments: { orderBy: { paidAt: "asc" as const } },
  partialPayments: { orderBy: { sortOrder: "asc" as const } },
  lateFeeEntries: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.InvoiceInclude;
