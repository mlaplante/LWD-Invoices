import { inngest } from "../client";
import { db } from "@/server/db";
import { Prisma, RecurringFrequency } from "@/generated/prisma";
import { generatePortalToken } from "@/lib/portal-session";

export function computeNextRunAt(
  from: Date,
  frequency: RecurringFrequency,
  interval: number,
): Date {
  const d = new Date(from);
  switch (frequency) {
    case "DAILY":
      d.setUTCDate(d.getUTCDate() + interval);
      break;
    case "WEEKLY":
      d.setUTCDate(d.getUTCDate() + interval * 7);
      break;
    case "MONTHLY":
      d.setUTCMonth(d.getUTCMonth() + interval);
      break;
    case "YEARLY":
      d.setUTCFullYear(d.getUTCFullYear() + interval);
      break;
  }
  return d;
}

export const processRecurringInvoices = inngest.createFunction(
  { id: "process-recurring-invoices", name: "Process Recurring Invoices", triggers: [{ cron: "0 6 * * *" }] }, // daily at 6am UTC
  async () => {
    const now = new Date();

    const due = await db.recurringInvoice.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
        OR: [{ endDate: null }, { endDate: { gt: now } }],
      },
      include: {
        invoice: {
          include: {
            lines: { include: { taxes: true } },
            currency: true,
          },
        },
        organization: true,
      },
    });

    const results = await Promise.allSettled(
      due.map((rec) => generateRecurringInvoice(rec)),
    );

    const autoCharged = results
      .filter((r) => r.status === "fulfilled")
      .reduce((sum, r) => {
        const val = (r as PromiseFulfilledResult<{ invoice: unknown; autoCharged: number }>).value;
        return sum + (val?.autoCharged ?? 0);
      }, 0);

    return {
      processed: due.length,
      succeeded: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
      autoCharged,
    };
  },
);

type RecurringInvoiceWithRelations = Prisma.RecurringInvoiceGetPayload<{
  include: {
    invoice: {
      include: {
        lines: { include: { taxes: true } };
        currency: true;
      };
    };
    organization: true;
  };
}>;

export async function generateRecurringInvoice(rec: RecurringInvoiceWithRelations) {
  const template = rec.invoice;
  let autoCharged = 0;

  const newInvoice = await db.$transaction(async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: rec.organizationId },
    });
    const number = `${org.invoicePrefix}-${String(org.invoiceNextNumber).padStart(4, "0")}`;
    await tx.organization.update({
      where: { id: org.id },
      data: { invoiceNextNumber: { increment: 1 } },
    });

    // Create the invoice with all lines nested. Prisma issues a single SQL
    // INSERT for the invoice plus a batched INSERT for its lines instead of
    // N round-trips. Line taxes still need a second pass because their FK
    // (invoiceLineId) only resolves after the lines are persisted.
    const invoice = await tx.invoice.create({
      data: {
        number,
        type: template.type,
        status: rec.autoSend || rec.autoCharge ? "SENT" : "DRAFT",
        date: new Date(),
        dueDate:
          template.dueDate
            ? new Date(Date.now() + (template.dueDate.getTime() - template.date.getTime()))
            : undefined,
        currencyId: template.currencyId,
        exchangeRate: template.exchangeRate,
        simpleAmount: template.simpleAmount,
        notes: template.notes,
        subtotal: template.subtotal,
        discountTotal: template.discountTotal,
        taxTotal: template.taxTotal,
        total: template.total,
        clientId: template.clientId,
        organizationId: template.organizationId,
        // Override schema's @default(cuid()) with crypto-strong randomness.
        portalToken: generatePortalToken(),
        // Snapshot the org's current early-pay offer (same rule as
        // invoices.create) — each generated invoice carries its own terms.
        ...(org.earlyPayDiscountEnabled &&
        org.earlyPayDiscountPercent.toNumber() > 0 &&
        (template.type === "SIMPLE" || template.type === "DETAILED")
          ? {
              earlyPayDiscountPercent: org.earlyPayDiscountPercent,
              earlyPayDiscountDays: org.earlyPayDiscountDays,
            }
          : {}),
        lines: {
          create: template.lines.map((line) => ({
            sort: line.sort,
            lineType: line.lineType,
            name: line.name,
            description: line.description,
            qty: line.qty,
            rate: line.rate,
            period: line.period,
            discount: line.discount,
            discountIsPercentage: line.discountIsPercentage,
            subtotal: line.subtotal,
            taxTotal: line.taxTotal,
            total: line.total,
          })),
        },
      },
      include: { lines: { orderBy: { sort: "asc" } } },
    });

    // Map template lines (ordered by sort asc, same as the include above) to
    // their newly-created counterparts so we can batch-insert all line taxes
    // in a single createMany. Template lines come back from Prisma ordered by
    // sort because the recurring-invoice's source invoice was created with
    // sort-ordered lines; we sort defensively here to make the index match.
    const templateLinesSorted = [...template.lines].sort(
      (a, b) => a.sort - b.sort,
    );
    const taxRows: { invoiceLineId: string; taxId: string; taxAmount: number | Prisma.Decimal }[] = [];
    for (let i = 0; i < invoice.lines.length; i++) {
      const created = invoice.lines[i];
      const source = templateLinesSorted[i];
      if (!source) continue;
      for (const lineTax of source.taxes) {
        taxRows.push({
          invoiceLineId: created.id,
          taxId: lineTax.taxId,
          taxAmount: lineTax.taxAmount,
        });
      }
    }
    if (taxRows.length > 0) {
      await tx.invoiceLineTax.createMany({ data: taxRows });
    }

    // Update recurring config INSIDE transaction for atomicity
    const maxReached =
      rec.maxOccurrences !== null &&
      rec.occurrenceCount + 1 >= rec.maxOccurrences;

    await tx.recurringInvoice.update({
      where: { id: rec.id },
      data: {
        occurrenceCount: { increment: 1 },
        nextRunAt: computeNextRunAt(rec.nextRunAt, rec.frequency, rec.interval),
        isActive: !maxReached,
      },
    });

    // Audit log INSIDE transaction
    await tx.auditLog.create({
      data: {
        action: "CREATED",
        entityType: "Invoice",
        entityId: invoice.id,
        entityLabel: invoice.number,
        organizationId: rec.organizationId,
      },
    });

    return invoice;
  });

  if (rec.autoCharge && newInvoice) {
    const { attemptRecurringInvoiceAutopay } = await import(
      "@/server/services/recurring-autopay"
    );
    const { sendPaymentReceiptEmail } = await import(
      "@/server/services/payment-receipt-email"
    );
    const { notifyOrgAdmins } = await import("@/server/services/notifications");

    const result = await attemptRecurringInvoiceAutopay({
      invoiceId: newInvoice.id,
      recurringInvoiceId: rec.id,
      autoCharge: rec.autoCharge,
      sendReceipt: sendPaymentReceiptEmail,
      notifyAdmins: notifyOrgAdmins,
    });
    if (result.status === "SUCCEEDED") autoCharged++;
  }

  return { invoice: newInvoice, autoCharged };
}
