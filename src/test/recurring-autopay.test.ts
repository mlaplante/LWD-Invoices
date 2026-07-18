/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attemptOffSessionCharge, attemptRecurringInvoiceAutopay } from "@/server/services/recurring-autopay";
import { createMockPrismaClient } from "./mocks/prisma";

function decimal(value: number) {
  return { toNumber: () => value };
}

function buildDb() {
  const db = createMockPrismaClient() as any;
  db.paymentAttempt = {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  db.savedPaymentMethod = {
    findFirst: vi.fn(),
  };
  db.partialPayment = { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() };
  db.$transaction = vi.fn(async (cb: any) => cb(db));
  return db;
}

function mockInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv_1",
    number: "INV-0001",
    status: "SENT",
    total: decimal(123.45),
    currency: { code: "USD" },
    clientId: "client_1",
    organizationId: "org_1",
    client: {
      id: "client_1",
      name: "Acme",
      stripeCustomerId: "cus_123",
      autoChargeEnabled: true,
    },
    // NOTE: a generated recurring invoice has NO `recurringInvoice` back-relation
    // (that 1:1 link belongs to the template invoice only). The recurring context
    // is supplied to autopay via the recurringInvoiceId/autoCharge params instead.
    ...overrides,
  };
}

const BASE_OPTS = { recurringInvoiceId: "rec_1", autoCharge: true } as const;

function mockSavedMethod(overrides: Record<string, unknown> = {}) {
  return {
    id: "spm_1",
    stripePaymentMethodId: "pm_123",
    expiresMonth: 12,
    expiresYear: 2099,
    ...overrides,
  };
}

describe("attemptRecurringInvoiceAutopay", () => {
  let db: any;
  let stripe: any;
  let sendReceipt: any;
  let notifyAdmins: any;

  beforeEach(() => {
    db = buildDb();
    stripe = {
      paymentIntents: {
        create: vi.fn().mockResolvedValue({ id: "pi_123", status: "succeeded" }),
      },
    };
    sendReceipt = vi.fn().mockResolvedValue(undefined);
    notifyAdmins = vi.fn().mockResolvedValue(undefined);
    db.invoice.findUnique.mockResolvedValue(mockInvoice());
    db.paymentAttempt.findUnique.mockResolvedValue(null);
    db.paymentAttempt.create.mockResolvedValue({ id: "attempt_1", status: "PENDING" });
    db.paymentAttempt.update.mockResolvedValue({ id: "attempt_1" });
    db.savedPaymentMethod.findFirst.mockResolvedValue(mockSavedMethod());
    db.payment.create.mockResolvedValue({ id: "payment_1" });
    db.invoice.update.mockResolvedValue({ id: "inv_1", status: "PAID" });
  });

  it("charges the default saved payment method and marks the invoice paid", async () => {
    const result = await attemptRecurringInvoiceAutopay({
      ...BASE_OPTS,
      db,
      invoiceId: "inv_1",
      stripeClient: stripe,
      sendReceipt,
      notifyAdmins,
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 12345,
        currency: "usd",
        customer: "cus_123",
        payment_method: "pm_123",
        off_session: true,
        confirm: true,
        metadata: expect.objectContaining({ invoiceId: "inv_1", recurringInvoiceId: "rec_1" }),
      }),
      { idempotencyKey: "recurring-autopay:inv_1" },
    );
    expect(db.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 123.45,
        method: "stripe_autopay",
        transactionId: "pi_123",
        invoiceId: "inv_1",
        organizationId: "org_1",
      }),
    });
    expect(db.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv_1" },
      data: { status: "PAID" },
    });
    expect(db.paymentAttempt.update).toHaveBeenLastCalledWith({
      where: { id: "attempt_1" },
      data: expect.objectContaining({ status: "SUCCEEDED", processorId: "pi_123" }),
    });
    expect(sendReceipt).toHaveBeenCalledWith({
      invoiceId: "inv_1",
      amountPaid: 123.45,
      organizationId: "org_1",
    });
  });

  it("records a failed attempt without marking paid when no saved method exists", async () => {
    db.savedPaymentMethod.findFirst.mockResolvedValue(null);

    const result = await attemptRecurringInvoiceAutopay({ ...BASE_OPTS, db, invoiceId: "inv_1", stripeClient: stripe, notifyAdmins });

    expect(result.status).toBe("FAILED");
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(db.invoice.update).not.toHaveBeenCalled();
    expect(db.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: "attempt_1" },
      data: expect.objectContaining({
        status: "FAILED",
        processorError: "No saved payment method on file",
      }),
    });
    expect(notifyAdmins).toHaveBeenCalled();
  });

  it("records declined charges and leaves invoice unpaid", async () => {
    stripe.paymentIntents.create.mockRejectedValue(new Error("Your card was declined"));

    const result = await attemptRecurringInvoiceAutopay({ ...BASE_OPTS, db, invoiceId: "inv_1", stripeClient: stripe, notifyAdmins });

    expect(result.status).toBe("FAILED");
    expect(db.payment.create).not.toHaveBeenCalled();
    expect(db.invoice.update).not.toHaveBeenCalled();
    expect(db.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: "attempt_1" },
      data: expect.objectContaining({
        status: "FAILED",
        processorError: "Your card was declined",
      }),
    });
  });

  it("does not create a duplicate charge when an autopay attempt already exists", async () => {
    db.paymentAttempt.findUnique.mockResolvedValue({ id: "attempt_existing", status: "SUCCEEDED", processorId: "pi_existing" });

    const result = await attemptRecurringInvoiceAutopay({ ...BASE_OPTS, db, invoiceId: "inv_1", stripeClient: stripe });

    expect(result.status).toBe("SKIPPED");
    expect((result as { reason?: string }).reason).toBe("Autopay attempt already exists");
    expect(db.paymentAttempt.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("records a failed attempt without charging when the saved method is expired", async () => {
    db.savedPaymentMethod.findFirst.mockResolvedValue(mockSavedMethod({ expiresMonth: 1, expiresYear: 2000 }));

    const result = await attemptRecurringInvoiceAutopay({ ...BASE_OPTS, db, invoiceId: "inv_1", stripeClient: stripe, notifyAdmins });

    expect(result.status).toBe("FAILED");
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(db.invoice.update).not.toHaveBeenCalled();
    expect(db.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: "attempt_1" },
      data: expect.objectContaining({
        status: "FAILED",
        savedPaymentMethodId: "spm_1",
        processorError: "Saved payment method is expired",
      }),
    });
    expect(notifyAdmins).toHaveBeenCalled();
  });

  it("records non-succeeded processor responses and leaves invoice unpaid", async () => {
    stripe.paymentIntents.create.mockResolvedValue({ id: "pi_requires_action", status: "requires_payment_method" });

    const result = await attemptRecurringInvoiceAutopay({ ...BASE_OPTS, db, invoiceId: "inv_1", stripeClient: stripe, notifyAdmins });

    expect(result.status).toBe("FAILED");
    expect(db.payment.create).not.toHaveBeenCalled();
    expect(db.invoice.update).not.toHaveBeenCalled();
    expect(db.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: "attempt_1" },
      data: expect.objectContaining({
        status: "FAILED",
        processorId: "pi_requires_action",
        processorError: "Stripe PaymentIntent status: requires_payment_method",
      }),
    });
  });

  it("records a failed attempt without charging when the client has no Stripe customer", async () => {
    db.invoice.findUnique.mockResolvedValue(mockInvoice({
      client: { id: "client_1", name: "Acme", stripeCustomerId: null, autoChargeEnabled: true },
    }));

    const result = await attemptRecurringInvoiceAutopay({ ...BASE_OPTS, db, invoiceId: "inv_1", stripeClient: stripe, notifyAdmins });

    expect(result.status).toBe("FAILED");
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(db.invoice.update).not.toHaveBeenCalled();
    expect(db.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: "attempt_1" },
      data: expect.objectContaining({
        status: "FAILED",
        processorError: "No Stripe customer on file",
      }),
    });
  });

  it("skips when recurring invoice autopay is disabled", async () => {
    const result = await attemptRecurringInvoiceAutopay({ ...BASE_OPTS, autoCharge: false, db, invoiceId: "inv_1", stripeClient: stripe });

    expect(result.status).toBe("SKIPPED");
    expect((result as { reason?: string }).reason).toBe("Autopay is disabled");
    expect(db.paymentAttempt.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("skips when client-level auto-charge is disabled", async () => {
    db.invoice.findUnique.mockResolvedValue(mockInvoice({
      client: { id: "client_1", name: "Acme", stripeCustomerId: "cus_123", autoChargeEnabled: false },
    }));

    const result = await attemptRecurringInvoiceAutopay({ ...BASE_OPTS, db, invoiceId: "inv_1", stripeClient: stripe });

    expect(result.status).toBe("SKIPPED");
    expect((result as { reason?: string }).reason).toBe("Autopay is disabled");
    expect(db.paymentAttempt.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("records a FAILED attempt (never orphans the PENDING one) when the Stripe gateway fails to load", async () => {
    // No stripeClient passed, so the service must load it via loadStripeClient,
    // which throws when the gateway is disabled. That throw must NOT escape and
    // leave the PENDING attempt stuck / reject recurring generation.
    db.gatewaySetting = { findUnique: vi.fn().mockResolvedValue({ isEnabled: false }) };

    const result = await attemptRecurringInvoiceAutopay({ ...BASE_OPTS, db, invoiceId: "inv_1", notifyAdmins });

    expect(result.status).toBe("FAILED");
    expect((result as { reason?: string }).reason).toBe("Stripe gateway is not enabled");
    // The PENDING attempt is resolved to FAILED rather than left dangling.
    expect(db.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: "attempt_1" },
      data: expect.objectContaining({
        status: "FAILED",
        processorError: "Stripe gateway is not enabled",
      }),
    });
    expect(notifyAdmins).toHaveBeenCalled();
  });
});

describe("attemptOffSessionCharge installment option", () => {
  it("charges and applies one installment without changing the full-invoice default", async () => {
    const db = buildDb();
    const stripe: any = { paymentIntents: { create: vi.fn().mockResolvedValue({ id: "pi_installment", status: "succeeded" }) } };
    db.invoice.findUnique.mockResolvedValue(mockInvoice());
    db.paymentAttempt.findUnique.mockResolvedValue(null);
    db.paymentAttempt.findFirst = vi.fn().mockResolvedValue(null);
    db.paymentAttempt.create.mockResolvedValue({ id: "attempt_installment" });
    db.paymentAttempt.update.mockResolvedValue({});
    db.savedPaymentMethod.findFirst.mockResolvedValue(mockSavedMethod());
    db.partialPayment.findUnique.mockResolvedValue({ id: "pp_1", invoiceId: "inv_1", isPaid: false });
    db.partialPayment.findMany.mockResolvedValue([{ id: "pp_1", isPaid: true }, { id: "pp_2", isPaid: false }]);
    db.partialPayment.update.mockResolvedValue({});
    db.payment.create.mockResolvedValue({});
    db.invoice.update.mockResolvedValue({});

    const result = await attemptOffSessionCharge({
      db,
      invoiceId: "inv_1",
      kind: "INSTALLMENT_AUTOPAY:pp_1",
      method: "stripe_installment_autopay",
      idempotencyKey: "installment-autopay:pp_1",
      installment: { id: "pp_1", amount: 40 },
      stripeClient: stripe,
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 4000 }), expect.anything());
    expect(db.paymentAttempt.create).toHaveBeenCalledWith({ data: expect.objectContaining({ partialPaymentId: "pp_1", amount: 40 }) });
    expect(db.partialPayment.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pp_1" }, data: expect.objectContaining({ isPaid: true }) }));
    expect(db.invoice.update).toHaveBeenCalledWith({ where: { id: "inv_1" }, data: { status: "PARTIALLY_PAID" } });
  });

  it("skips paid installments and installments with a pending or successful prior attempt", async () => {
    const db = buildDb();
    db.invoice.findUnique.mockResolvedValue(mockInvoice());
    db.partialPayment.findUnique.mockResolvedValue({ id: "pp_1", invoiceId: "inv_1", isPaid: true });

    const paid = await attemptOffSessionCharge({ db, invoiceId: "inv_1", kind: "INSTALLMENT_AUTOPAY:pp_1", method: "stripe_installment_autopay", idempotencyKey: "x", installment: { id: "pp_1", amount: 40 } });
    expect(paid).toMatchObject({ status: "SKIPPED" });

    db.partialPayment.findUnique.mockResolvedValue({ id: "pp_1", invoiceId: "inv_1", isPaid: false });
    db.paymentAttempt.findFirst = vi.fn().mockResolvedValue({ id: "pending", status: "PENDING" });
    const attempted = await attemptOffSessionCharge({ db, invoiceId: "inv_1", kind: "INSTALLMENT_AUTOPAY:pp_1", method: "stripe_installment_autopay", idempotencyKey: "y", installment: { id: "pp_1", amount: 40 } });
    expect(attempted).toMatchObject({ status: "SKIPPED" });
  });
});
