import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  partialPayment: { findMany: vi.fn() },
  savedPaymentMethod: { findFirst: vi.fn() },
  paymentAttempt: { findFirst: vi.fn() },
  attemptOffSessionCharge: vi.fn(),
  notifyOrgAdmins: vi.fn(),
  send: vi.fn(),
}));

// Return the function handler so each test can exercise the created Inngest function.
vi.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((_config: unknown, handler: unknown) => handler),
    send: h.send,
  },
}));
vi.mock("@/server/db", () => ({
  db: {
    partialPayment: h.partialPayment,
    savedPaymentMethod: h.savedPaymentMethod,
    paymentAttempt: h.paymentAttempt,
  },
}));
vi.mock("@/server/services/recurring-autopay", () => ({ attemptOffSessionCharge: h.attemptOffSessionCharge }));
vi.mock("@/server/services/notifications", () => ({ notifyOrgAdmins: h.notifyOrgAdmins }));
vi.mock("@/server/services/payment-receipt-email", () => ({ sendPaymentReceiptEmail: vi.fn() }));

import { processInstallmentAutopay } from "@/inngest/functions/installment-autopay";

const run = () =>
  (processInstallmentAutopay as unknown as (input: { step: { run: (id: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => Promise<unknown>)({
    step: { run: (_id, fn) => fn() },
  });

const decimal = (value: number) => ({ toNumber: () => value });

function installment(overrides: Record<string, unknown> = {}) {
  return {
    id: "installment_1",
    amount: decimal(75),
    isPercentage: false,
    invoice: {
      id: "invoice_1",
      clientId: "client_1",
      organizationId: "org_1",
      number: "INV-100",
      total: decimal(200),
      client: { name: "Ada Client", autoChargeEnabled: true },
      currency: { symbol: "$" },
      organization: { id: "org_1" },
    },
    ...overrides,
  };
}

describe("processInstallmentAutopay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.partialPayment.findMany.mockResolvedValue([]);
    h.savedPaymentMethod.findFirst.mockResolvedValue({ id: "method_1" });
    h.paymentAttempt.findFirst.mockResolvedValue(null);
    h.attemptOffSessionCharge.mockResolvedValue({ status: "SUCCEEDED" });
    h.notifyOrgAdmins.mockResolvedValue(undefined);
    h.send.mockResolvedValue(undefined);
  });

  it("charges an eligible installment with its amount and idempotency details", async () => {
    h.partialPayment.findMany.mockResolvedValue([installment()]);

    await expect(run()).resolves.toEqual({ candidates: 1, charged: 1 });
    expect(h.attemptOffSessionCharge).toHaveBeenCalledWith(expect.objectContaining({
      invoiceId: "invoice_1",
      kind: "INSTALLMENT_AUTOPAY:installment_1",
      idempotencyKey: "installment-autopay:installment_1",
      installment: { id: "installment_1", amount: 75 },
    }));
  });

  it("calculates percentage installments from the invoice total", async () => {
    h.partialPayment.findMany.mockResolvedValue([installment({ amount: decimal(50), isPercentage: true })]);

    await run();

    expect(h.attemptOffSessionCharge).toHaveBeenCalledWith(expect.objectContaining({
      installment: { id: "installment_1", amount: 100 },
    }));
  });

  it("skips when the client has disabled auto-charge", async () => {
    h.partialPayment.findMany.mockResolvedValue([installment({ invoice: { ...installment().invoice, client: { name: "Ada Client", autoChargeEnabled: false } } })]);

    await expect(run()).resolves.toEqual({ candidates: 1, charged: 0 });
    expect(h.attemptOffSessionCharge).not.toHaveBeenCalled();
  });

  it("skips when no default saved method exists", async () => {
    h.partialPayment.findMany.mockResolvedValue([installment()]);
    h.savedPaymentMethod.findFirst.mockResolvedValue(null);

    await run();

    expect(h.attemptOffSessionCharge).not.toHaveBeenCalled();
    expect(h.paymentAttempt.findFirst).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "SUCCEEDED"])("skips an installment with a prior %s attempt", async (status) => {
    h.partialPayment.findMany.mockResolvedValue([installment()]);
    h.paymentAttempt.findFirst.mockResolvedValue({ id: "attempt_1", status });

    await run();

    expect(h.attemptOffSessionCharge).not.toHaveBeenCalled();
  });

  it("notifies on a failed charge and continues processing later installments", async () => {
    h.partialPayment.findMany.mockResolvedValue([installment(), installment({ id: "installment_2", amount: decimal(25) })]);
    h.attemptOffSessionCharge
      .mockResolvedValueOnce({ status: "FAILED", reason: "Card declined" })
      .mockResolvedValueOnce({ status: "SUCCEEDED" });

    await expect(run()).resolves.toEqual({ candidates: 2, charged: 1 });

    expect(h.notifyOrgAdmins).toHaveBeenCalledWith("org_1", expect.objectContaining({
      type: "INVOICE_OVERDUE",
      title: "Auto-charge failed for installment",
      body: expect.stringContaining("Card declined"),
      link: "/invoices/invoice_1",
    }));
    expect(h.attemptOffSessionCharge).toHaveBeenCalledTimes(2);
    expect(h.attemptOffSessionCharge).toHaveBeenLastCalledWith(expect.objectContaining({
      installment: { id: "installment_2", amount: 25 },
    }));
  });
});
