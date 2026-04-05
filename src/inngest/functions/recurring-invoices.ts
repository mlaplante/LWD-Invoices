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

  // Auto-charge: attempt Stripe payment for clients with saved cards
  if (rec.autoSend && newInvoice) {
    const client = await db.client.findUnique({
      where: { id: template.clientId },
      select: { stripeCustomerId: true, autoChargeEnabled: true, email: true, name: true },
    });

    if (client?.stripeCustomerId && client.autoChargeEnabled) {
      try {
        // Get the org's Stripe config
        const gateway = await db.gatewaySetting.findUnique({
          where: {
            organizationId_gatewayType: {
              organizationId: template.organizationId,
              gatewayType: "STRIPE",
            },
          },
        });

        if (gateway?.isEnabled) {
          const { decryptJson } = await import("@/server/services/encryption");
          const { getStripeClient } = await import("@/server/services/stripe");
          const config = decryptJson<{ secretKey: string }>(gateway.configJson);
          const stripe = getStripeClient(config.secretKey);

          // Get the customer's default payment method
          const customer = await stripe.customers.retrieve(client.stripeCustomerId);
          if (customer.deleted) throw new Error("Customer deleted");

          const defaultPm =
            (customer as import("stripe").Stripe.Customer).invoice_settings
              ?.default_payment_method as string | null ??
            ((customer as import("stripe").Stripe.Customer).default_source as string | null);

          let pmToCharge: string | undefined;
          if (!defaultPm) {
            // No payment method on file — try to get the most recent one
            const paymentMethods = await stripe.paymentMethods.list({
              customer: client.stripeCustomerId,
              type: "card",
              limit: 1,
            });
            pmToCharge = paymentMethods.data[0]?.id;
          } else {
            pmToCharge = defaultPm;
          }

          if (pmToCharge) {
            // Attempt off-session charge
            const invoice = await db.invoice.findUnique({
              where: { id: newInvoice.id },
              include: { currency: true },
            });
            if (invoice) {
              const amountCents = Math.round(invoice.total.toNumber() * 100);
              const paymentIntent = await stripe.paymentIntents.create({
                amount: amountCents,
                currency: invoice.currency.code.toLowerCase(),
                customer: client.stripeCustomerId,
                payment_method: pmToCharge,
                off_session: true,
                confirm: true,
                metadata: {
                  invoiceId: newInvoice.id,
                  orgId: template.organizationId,
                  clientId: template.clientId,
                  autoCharge: "true",
                },
              });

              if (paymentIntent.status === "succeeded") {
                // Mark invoice as paid
                await db.$transaction(async (tx) => {
                  await tx.payment.create({
                    data: {
                      amount: invoice.total.toNumber(),
                      method: "stripe",
                      transactionId: paymentIntent.id,
                      invoiceId: newInvoice.id,
                      organizationId: template.organizationId,
                    },
                  });
                  await tx.invoice.update({
                    where: { id: newInvoice.id },
                    data: { status: "PAID" },
                  });
                });

                // Send receipt
                const { sendPaymentReceiptEmail } = await import(
                  "@/server/services/payment-receipt-email"
                );
                await sendPaymentReceiptEmail({
                  invoiceId: newInvoice.id,
                  amountPaid: invoice.total.toNumber(),
                  organizationId: template.organizationId,
                }).catch(() => {});

                autoCharged++;
              }
            }
          }
        }
      } catch (err) {
        // Auto-charge failed — fall through to normal send
        console.error(
          `[recurring-invoices] Auto-charge failed for invoice ${newInvoice.number}:`,
          err,
        );

        // Notify org admin of the failure
        const { notifyOrgAdmins } = await import("@/server/services/notifications");
        await notifyOrgAdmins(template.organizationId, {
          type: "INVOICE_OVERDUE",
          title: `Auto-charge failed for Invoice #${newInvoice.number}`,
          body: `Card charge declined for ${client.name ?? "client"}. Invoice was sent to their email instead.`,
          link: `/invoices/${newInvoice.id}`,
        }).catch(() => {});
      }
    }
  }

  return { invoice: newInvoice, autoCharged };
}
