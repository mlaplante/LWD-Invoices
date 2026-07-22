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
  if (!opts.autoCharge) {
    return { status: "SKIPPED", reason: "Autopay is disabled" };
  }
  return attemptOffSessionCharge({
    db: opts.db,
    invoiceId: opts.invoiceId,
    kind: AUTOPAY_KIND,
    method: "stripe_autopay",
    idempotencyKey: `recurring-autopay:${opts.invoiceId}`,
    metadata: { recurringInvoiceId: opts.recurringInvoiceId, autoCharge: "true" },
    stripeClient: opts.stripeClient,
    sendReceipt: opts.sendReceipt,
    notifyAdmins: opts.notifyAdmins,
  });
}

/**
 * Charge an invoice's saved Stripe payment method off-session and record the
 * outcome as a PaymentAttempt of the given `kind`. The (invoiceId, kind)
 * unique constraint makes each kind a one-shot per invoice — callers express
 * retries as new kinds (AUTOPAY, DUNNING_RETRY_1, …) so a crashed/duplicated
 * run can never double-charge.
 */
export async function attemptOffSessionCharge(opts: {
  db?: DbClient;
  invoiceId: string;
  kind: string;
  method: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
  stripeClient?: StripeClient;
  installment?: { id: string; amount: number };
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
  if (!invoice.client.autoChargeEnabled) {
    return { status: "SKIPPED", reason: "Autopay is disabled" };
  }

  if (opts.installment) {
    const installment = await db.partialPayment.findUnique({ where: { id: opts.installment.id } });
    if (!installment || installment.invoiceId !== invoice.id || installment.isPaid) {
      return { status: "SKIPPED", reason: "Installment is already paid or not found" };
    }
    const priorAttempt = await db.paymentAttempt.findFirst({
      where: {
        partialPaymentId: opts.installment.id,
        status: { in: ["PENDING", "SUCCEEDED"] },
      },
    });
    if (priorAttempt) {
      return { status: "SKIPPED", reason: "Installment autopay attempt already exists", attemptId: priorAttempt.id };
    }
  }

  const existingAttempt = await db.paymentAttempt.findUnique({
    where: { invoiceId_kind: { invoiceId: invoice.id, kind: opts.kind } },
  });
  if (existingAttempt) {
    return {
      status: "SKIPPED",
      reason: "Autopay attempt already exists",
      attemptId: existingAttempt.id,
    };
  }

  const amount = opts.installment?.amount ?? invoice.total.toNumber();
  const idempotencyKey = opts.idempotencyKey;
  let attempt: { id: string };
  try {
    attempt = await db.paymentAttempt.create({
      data: {
        kind: opts.kind,
        status: "PENDING",
        amount,
        method: opts.method,
        processor: "stripe",
        idempotencyKey,
        invoiceId: invoice.id,
        organizationId: invoice.organizationId,
        partialPaymentId: opts.installment?.id,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await db.paymentAttempt.findUnique({
        where: { invoiceId_kind: { invoiceId: invoice.id, kind: opts.kind } },
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
          orgId: invoice.organizationId,
          clientId: invoice.clientId,
          // Marks this Intent as eligible for the payment_intent.succeeded
          // backstop: the payment is recorded inline below, so if that write
          // fails the webhook is the only thing left to record it.
          source: "off_session",
          ...(opts.installment ? { partialPaymentId: opts.installment.id } : {}),
          ...(opts.metadata ?? {}),
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
          method: opts.method,
          transactionId: paymentIntent.id,
          invoiceId: invoice.id,
          organizationId: invoice.organizationId,
        },
      });
      if (opts.installment) {
        await tx.partialPayment.update({
          where: { id: opts.installment.id },
          data: { isPaid: true, paidAt: new Date(), paymentMethod: opts.method, transactionId: paymentIntent.id },
        });
        const installments = await tx.partialPayment.findMany({ where: { invoiceId: invoice.id } });
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: installments.every((installment) => installment.isPaid) ? "PAID" : "PARTIALLY_PAID" },
        });
      } else {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: "PAID" },
        });
      }
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
