import { inngest } from "../client";
import { db } from "@/server/db";
import { sendEmail } from "@/server/services/email-sender";
import { notifyOrgAdmins } from "@/server/services/notifications";
import { attemptOffSessionCharge } from "@/server/services/recurring-autopay";
import { sendPaymentReceiptEmail } from "@/server/services/payment-receipt-email";
import { nextDunningAction, type DunningAttempt } from "@/server/services/dunning";

const PAYABLE_STATUSES = ["SENT", "PARTIALLY_PAID", "OVERDUE"] as const;

/**
 * Failed-payment recovery cron. For every dunning-enabled org, finds unpaid
 * invoices whose auto-charge failed and either re-attempts the charge
 * (1/3/7 days after the initial failure; each retry slot idempotent via the
 * PaymentAttempt (invoiceId, kind) unique constraint) or — once retries are
 * exhausted or the failure is unfixable by retrying — escalates: emails the
 * client a pay link and notifies admins. Escalation is terminal per invoice
 * (Invoice.dunningEscalatedAt).
 */
export const processDunningRetries = inngest.createFunction(
  { id: "process-dunning-retries", name: "Process Dunning Retries", triggers: [{ cron: "0 9 * * *" }] }, // daily at 9am UTC
  async () => {
    const now = new Date();

    const orgs = await db.organization.findMany({
      where: { dunningEnabled: true },
      select: { id: true, name: true, logoUrl: true, hidePoweredBy: true },
    });

    let retried = 0;
    let recovered = 0;
    let escalated = 0;

    for (const org of orgs) {
      const invoices = await db.invoice.findMany({
        where: {
          organizationId: org.id,
          status: { in: [...PAYABLE_STATUSES] },
          isArchived: false,
          dunningEscalatedAt: null,
          paymentAttempts: { some: { kind: "AUTOPAY", status: "FAILED" } },
        },
        include: {
          paymentAttempts: {
            select: {
              kind: true,
              status: true,
              processorError: true,
              completedAt: true,
              attemptedAt: true,
            },
          },
          client: { select: { name: true, email: true } },
          currency: { select: { symbol: true } },
        },
      });

      for (const invoice of invoices) {
        const action = nextDunningAction(invoice.paymentAttempts as DunningAttempt[], now);

        if (action.type === "RETRY") {
          retried++;
          const result = await attemptOffSessionCharge({
            invoiceId: invoice.id,
            kind: action.kind,
            method: "stripe_autopay",
            idempotencyKey: `dunning:${invoice.id}:${action.kind}`,
            metadata: { dunningRetry: action.kind },
            sendReceipt: sendPaymentReceiptEmail,
            notifyAdmins: notifyOrgAdmins,
          }).catch((err) => {
            console.error(`[dunning] Retry threw for invoice ${invoice.id}:`, err);
            return { status: "FAILED" as const, attemptId: "", reason: String(err) };
          });

          if (result.status === "SUCCEEDED") {
            recovered++;
            await notifyOrgAdmins(org.id, {
              type: "INVOICE_PAID",
              title: `Payment recovered for Invoice #${invoice.number}`,
              body: `Dunning retry charged ${invoice.currency.symbol}${invoice.total.toFixed(2)} for ${invoice.client.name}.`,
              link: `/invoices/${invoice.id}`,
            }).catch(() => undefined);
          }
          continue;
        }

        if (action.type === "ESCALATE") {
          escalated++;
          await escalateInvoice({
            invoice: {
              id: invoice.id,
              number: invoice.number,
              total: invoice.total.toFixed(2),
              currencySymbol: invoice.currency.symbol,
              portalToken: invoice.portalToken,
              clientName: invoice.client.name,
              clientEmail: invoice.client.email,
            },
            org,
          });
        }
        // WAIT / NONE: nothing to do this run.
      }
    }

    return { orgs: orgs.length, retried, recovered, escalated };
  },
);

async function escalateInvoice(opts: {
  invoice: {
    id: string;
    number: string;
    total: string;
    currencySymbol: string;
    portalToken: string | null;
    clientName: string;
    clientEmail: string | null;
  };
  org: { id: string; name: string; logoUrl: string | null; hidePoweredBy: boolean };
}) {
  const { invoice, org } = opts;

  // Stamp first: even if the email fails we must not re-escalate daily.
  // Admins get notified either way and can chase manually.
  await db.invoice.update({
    where: { id: invoice.id },
    data: { dunningEscalatedAt: new Date() },
  });

  let emailSent = false;
  if (invoice.clientEmail && invoice.portalToken) {
    try {
      const { render } = await import("@react-email/render");
      const { DunningEmail } = await import("@/emails/DunningEmail");
      const portalLink = `${process.env.NEXT_PUBLIC_APP_URL}/portal/${invoice.portalToken}`;
      const html = await render(
        DunningEmail({
          invoiceNumber: invoice.number,
          clientName: invoice.clientName,
          total: invoice.total,
          currencySymbol: invoice.currencySymbol,
          orgName: org.name,
          portalLink,
          logoUrl: org.logoUrl ?? undefined,
          hidePoweredBy: org.hidePoweredBy,
        }),
      );
      const result = await sendEmail({
        organizationId: org.id,
        invoiceId: invoice.id,
        to: invoice.clientEmail,
        subject: `Action needed — payment for Invoice #${invoice.number} did not go through`,
        html,
      });
      emailSent = !result.suppressed;
    } catch (err) {
      console.error(`[dunning] Escalation email failed for invoice ${invoice.id}:`, err);
    }
  }

  await notifyOrgAdmins(org.id, {
    type: "INVOICE_OVERDUE",
    title: `Payment recovery exhausted for Invoice #${invoice.number}`,
    body: emailSent
      ? `Automatic charges for ${invoice.clientName} kept failing. The client was emailed a pay link.`
      : `Automatic charges for ${invoice.clientName} kept failing and the client could not be emailed. Follow up manually.`,
    link: `/invoices/${invoice.id}`,
  }).catch(() => undefined);
}
