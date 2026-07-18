import { inngest } from "../client";
import { db } from "@/server/db";
import { notifyOrgAdmins } from "@/server/services/notifications";
import { sendPaymentReceiptEmail } from "@/server/services/payment-receipt-email";
import { attemptOffSessionCharge } from "@/server/services/recurring-autopay";

const PAYABLE_STATUSES = ["SENT", "PARTIALLY_PAID", "OVERDUE"] as const;

/** Daily, one-shot auto-charge for due installments on opted-in invoices. */
export const processInstallmentAutopay = inngest.createFunction(
  { id: "process-installment-autopay", name: "Process Installment Autopay", triggers: [{ cron: "0 8 * * *" }] },
  async ({ step }) => {
    const now = new Date();
    const installments = await db.partialPayment.findMany({
      where: {
        isPaid: false,
        dueDate: { not: null, lte: now },
        invoice: {
          installmentAutoChargeEnabled: true,
          isArchived: false,
          status: { in: [...PAYABLE_STATUSES] },
        },
      },
      include: {
        invoice: { include: { client: true, currency: true, organization: true } },
      },
      take: 100,
      orderBy: { dueDate: "asc" },
    });

    const results = await Promise.all(installments.map((installment) => step.run(
      `charge-installment-${installment.id}`,
      async () => {
        const invoice = installment.invoice;
        if (!invoice.client.autoChargeEnabled) return { status: "SKIPPED" as const, reason: "Autopay is disabled" };
        const savedMethod = await db.savedPaymentMethod.findFirst({
          where: { clientId: invoice.clientId, organizationId: invoice.organizationId, isDefault: true },
          orderBy: { createdAt: "desc" },
        });
        if (!savedMethod) return { status: "SKIPPED" as const, reason: "No saved payment method" };
        const priorAttempt = await db.paymentAttempt.findFirst({
          where: { partialPaymentId: installment.id, status: { in: ["PENDING", "SUCCEEDED"] } },
        });
        if (priorAttempt) return { status: "SKIPPED" as const, reason: "Installment already attempted" };

        const amount = installment.isPercentage
          ? (installment.amount.toNumber() / 100) * invoice.total.toNumber()
          : installment.amount.toNumber();
        const result = await attemptOffSessionCharge({
          db,
          invoiceId: invoice.id,
          kind: `INSTALLMENT_AUTOPAY:${installment.id}`,
          method: "stripe_installment_autopay",
          idempotencyKey: `installment-autopay:${installment.id}`,
          installment: { id: installment.id, amount },
          sendReceipt: sendPaymentReceiptEmail,
        });
        if (result.status === "FAILED") {
          await notifyOrgAdmins(invoice.organizationId, {
            type: "INVOICE_OVERDUE",
            title: "Auto-charge failed for installment",
            body: `${invoice.client.name}'s installment on Invoice #${invoice.number} (${invoice.currency.symbol}${amount.toFixed(2)}) could not be charged: ${result.reason}`,
            link: `/invoices/${invoice.id}`,
          }).catch(() => undefined);
        }
        if (result.status === "SUCCEEDED") {
          await inngest.send({ name: "invoice/payment.received", data: { invoiceId: invoice.id, organizationId: invoice.organizationId } });
        }
        return result;
      },
    )));
    return { candidates: installments.length, charged: results.filter((result) => result.status === "SUCCEEDED").length };
  },
);
