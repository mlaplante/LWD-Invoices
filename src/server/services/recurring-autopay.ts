import type Stripe from "stripe";
import type { PrismaClient } from "@/generated/prisma";
import { db as defaultDb } from "@/server/db";

const AUTOPAY_KIND = "AUTOPAY";

type DbClient = PrismaClient;

type StripeClient = Pick<Stripe, "paymentIntents">;

type AttemptResult =
  | { status: "SUCCEEDED"; attemptId: string; processorId: string }
  | { status: "FAILED"; attemptId: string; reason: string }
  | { status: "SKIPPED"; reason: string; attemptId?: string };

export async function attemptRecurringInvoiceAutopay(opts: {
  db?: DbClient;
  invoiceId: string;
  // Recurring context is passed in explicitly by the caller (the generator),
  // which has the RecurringInvoice in scope. A generated invoice has NO
  // `recurringInvoice` back-relation — that 1:1 link belongs to the template
  // invoice only — so we cannot resolve it from the generated invoice itself.
  recurringInvoiceId: string;
  autoCharge: boolean;
  stripeClient?: StripeClient;
  sendReceipt?: (input: { invoiceId: string; amountPaid: number; organizationId: string }) => Promise<unknown>;
  notifyAdmins?: (
    organizationId: string,
    input: { type: "INVOICE_OVERDUE"; title: string; body: string; link: string },
  ) => Promise<unknown>;
}): Promise<AttemptResult> {
  const db = opts.db ?? defaultDb;
  const invoice = await db.invoice.findUnique({
    where: { id: opts.invoiceId },
    include: {
      currency: true,
      client: {
        select: {
          id: true,
          name: true,
          stripeCustomerId: true,
          autoChargeEnabled: true,
        },
      },
    },
  });

  if (!invoice) return { status: "SKIPPED", reason: "Invoice not found" };
  if (!invoice.client) return { status: "SKIPPED", reason: "Invoice has no client" };
  if (invoice.status === "PAID") return { status: "SKIPPED", reason: "Invoice already paid" };
  if (!opts.autoCharge || !invoice.client.autoChargeEnabled) {
    return { status: "SKIPPED", reason: "Autopay is disabled" };
  }

  const existingAttempt = await db.paymentAttempt.findUnique({
    where: { invoiceId_kind: { invoiceId: invoice.id, kind: AUTOPAY_KIND } },
  });
  if (existingAttempt) {
    return {
      status: "SKIPPED",
      reason: "Autopay attempt already exists",
      attemptId: existingAttempt.id,
    };
  }

  const amount = invoice.total.toNumber();
  const idempotencyKey = `recurring-autopay:${invoice.id}`;
  let attempt: { id: string };
  try {
    attempt = await db.paymentAttempt.create({
      data: {
        kind: AUTOPAY_KIND,
        status: "PENDING",
        amount,
        method: "stripe_autopay",
        processor: "stripe",
        idempotencyKey,
        invoiceId: invoice.id,
        organizationId: invoice.organizationId,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await db.paymentAttempt.findUnique({
        where: { invoiceId_kind: { invoiceId: invoice.id, kind: AUTOPAY_KIND } },
      });
      return {
        status: "SKIPPED",
        reason: "Autopay attempt already exists",
        attemptId: existing?.id,
      };
    }
    throw error;
  }

  if (!invoice.client.stripeCustomerId) {
    return failAttempt(db, attempt.id, "No Stripe customer on file", invoice, opts.notifyAdmins);
  }

  const savedPaymentMethod = await db.savedPaymentMethod.findFirst({
    where: {
      clientId: invoice.clientId,
      organizationId: invoice.organizationId,
      isDefault: true,
    },
    orderBy: { createdAt: "desc" },
  }) ?? await db.savedPaymentMethod.findFirst({
    where: {
      clientId: invoice.clientId,
      organizationId: invoice.organizationId,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!savedPaymentMethod) {
    return failAttempt(db, attempt.id, "No saved payment method on file", invoice, opts.notifyAdmins);
  }

  if (isExpired(savedPaymentMethod.expiresMonth, savedPaymentMethod.expiresYear)) {
    return failAttempt(
      db,
      attempt.id,
      "Saved payment method is expired",
      invoice,
      opts.notifyAdmins,
      savedPaymentMethod.id,
    );
  }

  await db.paymentAttempt.update({
    where: { id: attempt.id },
    data: { savedPaymentMethodId: savedPaymentMethod.id },
  });

  try {
    // Load the Stripe client INSIDE the try: loadStripeClient throws when the
    // gateway is disabled or the encrypted config fails to decrypt. If that
    // escaped, the PENDING attempt above would be orphaned and the throw would
    // propagate up and reject recurring generation AFTER the invoice and
    // schedule were already committed. Routing it through failAttempt instead
    // records a FAILED attempt and notifies admins, like any other charge error.
    const stripe = opts.stripeClient ?? await loadStripeClient(invoice.organizationId, db);

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: Math.round(amount * 100),
        currency: invoice.currency.code.toLowerCase(),
        customer: invoice.client.stripeCustomerId,
        payment_method: savedPaymentMethod.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          invoiceId: invoice.id,
          recurringInvoiceId: opts.recurringInvoiceId,
          orgId: invoice.organizationId,
          clientId: invoice.clientId,
          autoCharge: "true",
        },
      },
      { idempotencyKey },
    );

    if (paymentIntent.status !== "succeeded") {
      return failAttempt(
        db,
        attempt.id,
        `Stripe PaymentIntent status: ${paymentIntent.status}`,
        invoice,
        opts.notifyAdmins,
        savedPaymentMethod.id,
        paymentIntent.id,
      );
    }

    await db.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          amount,
          method: "stripe_autopay",
          transactionId: paymentIntent.id,
          invoiceId: invoice.id,
          organizationId: invoice.organizationId,
        },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: "PAID" },
      });
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "SUCCEEDED",
          processorId: paymentIntent.id,
          processorError: null,
          savedPaymentMethodId: savedPaymentMethod.id,
          completedAt: new Date(),
        },
      });
    });

    await opts.sendReceipt?.({
      invoiceId: invoice.id,
      amountPaid: amount,
      organizationId: invoice.organizationId,
    }).catch(() => undefined);

    return { status: "SUCCEEDED", attemptId: attempt.id, processorId: paymentIntent.id };
  } catch (error) {
    return failAttempt(
      db,
      attempt.id,
      error instanceof Error ? error.message : "Stripe charge failed",
      invoice,
      opts.notifyAdmins,
      savedPaymentMethod.id,
    );
  }
}

async function failAttempt(
  db: DbClient,
  attemptId: string,
  reason: string,
  invoice: {
    id: string;
    number: string;
    organizationId: string;
    client: { name: string | null };
  },
  notifyAdmins?: (
    organizationId: string,
    input: { type: "INVOICE_OVERDUE"; title: string; body: string; link: string },
  ) => Promise<unknown>,
  savedPaymentMethodId?: string,
  processorId?: string,
): Promise<AttemptResult> {
  await db.paymentAttempt.update({
    where: { id: attemptId },
    data: {
      status: "FAILED",
      processorId,
      processorError: reason,
      ...(savedPaymentMethodId ? { savedPaymentMethodId } : {}),
      completedAt: new Date(),
    },
  });

  await notifyAdmins?.(invoice.organizationId, {
    type: "INVOICE_OVERDUE",
    title: `Auto-charge failed for Invoice #${invoice.number}`,
    body: `${reason} for ${invoice.client.name ?? "client"}. Invoice remains unpaid.`,
    link: `/invoices/${invoice.id}`,
  }).catch(() => undefined);

  return { status: "FAILED", attemptId, reason };
}

async function loadStripeClient(organizationId: string, db: DbClient): Promise<StripeClient> {
  const gateway = await db.gatewaySetting.findUnique({
    where: {
      organizationId_gatewayType: {
        organizationId,
        gatewayType: "STRIPE",
      },
    },
  });

  if (!gateway?.isEnabled) throw new Error("Stripe gateway is not enabled");

  const { decryptJson } = await import("@/server/services/encryption");
  const { getStripeClient } = await import("@/server/services/stripe");
  const config = decryptJson<{ secretKey: string }>(gateway.configJson);
  return getStripeClient(config.secretKey);
}

function isExpired(expiresMonth: number, expiresYear: number): boolean {
  const now = new Date();
  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();
  return expiresYear < currentYear || (expiresYear === currentYear && expiresMonth < currentMonth);
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
