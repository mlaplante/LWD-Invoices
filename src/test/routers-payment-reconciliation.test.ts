import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockContext } from "./mocks/trpc-context";
import { InvoiceStatus } from "@/generated/prisma";
import { paymentReconciliationRouter } from "@/server/routers/paymentReconciliation";

vi.mock("@/server/services/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/server/services/payment-receipt-email", () => ({
  sendPaymentReceiptEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/inngest/client", () => ({ inngest: { send: vi.fn().mockResolvedValue(undefined) } }));

describe("paymentReconciliation router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = paymentReconciliationRouter.createCaller(ctx);
  });

  it("creates an unmatched payment", async () => {
    ctx.db.unmatchedPayment.create.mockResolvedValue({ id: "up_1", status: "UNMATCHED" });

    const result = await caller.create({ amount: 100, method: "check" });

    expect(result.status).toBe("UNMATCHED");
    expect(ctx.db.unmatchedPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "test-org-123",
        amount: 100,
        method: "check",
        status: "UNMATCHED",
      }),
    });
  });

  it("matches two invoices and marks an exact allocation as matched", async () => {
    ctx.db.unmatchedPayment.findFirst.mockResolvedValue({
      id: "up_1", amount: 100, matchedAmount: 0, method: "ach", reference: "ref", notes: null,
      receivedAt: new Date("2026-07-18"), status: "UNMATCHED",
    });
    ctx.db.invoice.findFirst
      .mockResolvedValueOnce({ id: "inv_1", number: "INV-1", total: 40, status: InvoiceStatus.SENT, payments: [], creditNotesReceived: [] })
      .mockResolvedValueOnce({ id: "inv_2", number: "INV-2", total: 60, status: InvoiceStatus.SENT, payments: [], creditNotesReceived: [] });
    ctx.db.payment.create.mockResolvedValue({ id: "pay_1" });
    ctx.db.invoice.update.mockResolvedValue({});
    ctx.db.unmatchedPayment.update.mockResolvedValue({ id: "up_1", status: "MATCHED" });

    await caller.match({ id: "up_1", applications: [{ invoiceId: "inv_1", amount: 40 }, { invoiceId: "inv_2", amount: 60 }] });

    expect(ctx.db.payment.create).toHaveBeenCalledTimes(2);
    expect(ctx.db.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: InvoiceStatus.PAID } }));
    expect(ctx.db.unmatchedPayment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "MATCHED" }) }));
  });

  it("retains partial matching and a partially paid invoice for underpayment", async () => {
    ctx.db.unmatchedPayment.findFirst.mockResolvedValue({
      id: "up_1", amount: 200, matchedAmount: 0, method: "check", reference: null, notes: null,
      receivedAt: new Date(), status: "UNMATCHED",
    });
    ctx.db.invoice.findFirst.mockResolvedValue({
      id: "inv_1", number: "INV-1", total: 150, status: InvoiceStatus.SENT, payments: [], creditNotesReceived: [],
    });
    ctx.db.payment.create.mockResolvedValue({ id: "pay_1" });
    ctx.db.invoice.update.mockResolvedValue({});
    ctx.db.unmatchedPayment.update.mockResolvedValue({ id: "up_1", status: "PARTIALLY_MATCHED" });

    await caller.match({ id: "up_1", applications: [{ invoiceId: "inv_1", amount: 100 }] });

    expect(ctx.db.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: InvoiceStatus.PARTIALLY_PAID } }));
    expect(ctx.db.unmatchedPayment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PARTIALLY_MATCHED" }) }));
  });

  it("rejects over-allocation and ignored payments", async () => {
    ctx.db.unmatchedPayment.findFirst.mockResolvedValue({ id: "up_1", amount: 10, matchedAmount: 0, status: "UNMATCHED" });
    await expect(caller.match({ id: "up_1", applications: [{ invoiceId: "inv_1", amount: 11 }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    ctx.db.unmatchedPayment.findFirst.mockResolvedValue({ id: "up_1", amount: 10, matchedAmount: 0, status: "IGNORED" });
    await expect(caller.match({ id: "up_1", applications: [{ invoiceId: "inv_1", amount: 1 }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a cross-org invoice lookup", async () => {
    ctx.db.unmatchedPayment.findFirst.mockResolvedValue({ id: "up_1", amount: 10, matchedAmount: 0, method: "cash", status: "UNMATCHED" });
    ctx.db.invoice.findFirst.mockResolvedValue(null);

    await expect(caller.match({ id: "up_1", applications: [{ invoiceId: "other-org", amount: 1 }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows ignore and unignore transitions", async () => {
    ctx.db.unmatchedPayment.findFirst.mockResolvedValueOnce({ id: "up_1", status: "UNMATCHED" });
    ctx.db.unmatchedPayment.update.mockResolvedValueOnce({ id: "up_1", status: "IGNORED" });
    await expect(caller.ignore({ id: "up_1" })).resolves.toMatchObject({ status: "IGNORED" });

    ctx.db.unmatchedPayment.findFirst.mockResolvedValueOnce({ id: "up_1", status: "IGNORED" });
    ctx.db.unmatchedPayment.update.mockResolvedValueOnce({ id: "up_1", status: "UNMATCHED" });
    await expect(caller.unignore({ id: "up_1" })).resolves.toMatchObject({ status: "UNMATCHED" });
  });
});
