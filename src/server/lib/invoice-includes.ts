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

/** Detail include for single-invoice get / update / send flows. */
export const detailInvoiceInclude = {
  client: { select: { id: true, name: true, email: true, address: true } },
  currency: true,
  organization: {
    select: {
      id: true,
      name: true,
      logoUrl: true,
      brandColor: true,
      invoicePrefix: true,
      invoiceTemplate: true,
      invoiceFontFamily: true,
      invoiceAccentColor: true,
      invoiceShowLogo: true,
      invoiceFooterText: true,
      defaultPaymentTermsDays: true,
      paymentReminderDays: true,
      lateFeeEnabled: true,
      lateFeeType: true,
      lateFeeAmount: true,
      lateFeeGraceDays: true,
      lateFeeRecurring: true,
      lateFeeMaxApplications: true,
      lateFeeIntervalDays: true,
    },
  },
  lines: {
    include: { taxes: { include: { tax: true } } },
    orderBy: { sort: "asc" as const },
  },
  payments: { orderBy: { paidAt: "asc" as const } },
  partialPayments: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.InvoiceInclude;

/** Summary include for list/index pages — minimal payload. */
export const summaryInvoiceInclude = {
  client: { select: { id: true, name: true } },
  currency: { select: { id: true, symbol: true, symbolPosition: true } },
  recurringInvoice: { select: { isActive: true, frequency: true } },
} satisfies Prisma.InvoiceInclude;
