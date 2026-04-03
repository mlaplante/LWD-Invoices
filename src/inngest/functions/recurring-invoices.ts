import { inngest } from "../client";
import { db } from "@/server/db";
import { Prisma, RecurringFrequency } from "@/generated/prisma";

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

    return {
      processed: due.length,
      succeeded: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
    };
  },
);

const recurringInvoiceWithRelations = Prisma.validator<Prisma.RecurringInvoiceDefaultArgs>()({
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

type RecurringInvoiceWithRelations = Prisma.RecurringInvoiceGetPayload<
  typeof recurringInvoiceWithRelations
>;

async function generateRecurringInvoice(rec: RecurringInvoiceWithRelations) {
  const template = rec.invoice;

  const newInvoice = await db.$transaction(async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: rec.organizationId },
    });
    const number = `${org.invoicePrefix}-${String(org.invoiceNextNumber).padStart(4, "0")}`;
    await tx.organization.update({
      where: { id: org.id },
      data: { invoiceNextNumber: { increment: 1 } },
    });

    const invoice = await tx.invoice.create({
      data: {
        number,
        type: template.type,
        status: rec.autoSend ? "SENT" : "DRAFT",
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
      },
    });

    for (const line of template.lines) {
      const newLine = await tx.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
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
        },
      });
      for (const lineTax of line.taxes) {
        await tx.invoiceLineTax.create({
          data: {
            invoiceLineId: newLine.id,
            taxId: lineTax.taxId,
            taxAmount: lineTax.taxAmount,
          },
        });
      }
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

  return newInvoice;
}
