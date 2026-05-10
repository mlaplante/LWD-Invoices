import type { Prisma } from "@/generated/prisma";

/**
 * Organization fields needed to render an invoice PDF and the surrounding
 * email envelope. Centralized so the PDF templates and email layouts share
 * one schema — if a template starts referencing a new org field, add it here.
 */
const orgPdfSelect = {
  id: true,
  name: true,
  logoUrl: true,
  brandColor: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  invoiceTemplate: true,
  invoiceFontFamily: true,
  invoiceAccentColor: true,
  invoiceShowLogo: true,
  invoiceFooterText: true,
  hidePoweredBy: true,
  portalTagline: true,
  portalFooterText: true,
  // Used by the payment-reminders Inngest function which fetches invoices
  // via fullInvoiceInclude and reads org.paymentReminderDays to decide
  // when to send.
  paymentReminderDays: true,
} as const satisfies Prisma.OrganizationSelect;

/**
 * Full invoice include for PDF generation and email rendering.
 * Used by Inngest functions, API routes, and tRPC procedures.
 */
export const fullInvoiceInclude = {
  client: true,
  currency: true,
  organization: { select: orgPdfSelect },
  lines: {
    include: {
      taxes: { include: { tax: true } },
      stripeTaxBreakdown: true,
    },
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
