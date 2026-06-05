/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression guard for the seam where autopay was silently skipped: the
// generator must thread the RecurringInvoice context (id + autoCharge) into
// attemptRecurringInvoiceAutopay. A generated invoice has NO `recurringInvoice`
// back-relation, so autopay cannot resolve it from the invoice — if the
// generator fails to pass it through, every real recurring charge is skipped.

const h = vi.hoisted(() => {
  const tx = {
    organization: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    invoice: { create: vi.fn() },
    invoiceLineTax: { createMany: vi.fn() },
    recurringInvoice: { update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    db: { $transaction: vi.fn(async (cb: any) => cb(tx)) },
    attemptRecurringInvoiceAutopay: vi.fn(),
    sendPaymentReceiptEmail: vi.fn(),
    notifyOrgAdmins: vi.fn(),
  };
});

vi.mock("@/inngest/client", () => ({
  inngest: { createFunction: vi.fn(() => ({})) },
}));
vi.mock("@/server/db", () => ({ db: h.db }));
vi.mock("@/lib/portal-session", () => ({
  generatePortalToken: () => "portal_token_x",
}));
vi.mock("@/server/services/recurring-autopay", () => ({
  attemptRecurringInvoiceAutopay: h.attemptRecurringInvoiceAutopay,
}));
vi.mock("@/server/services/payment-receipt-email", () => ({
  sendPaymentReceiptEmail: h.sendPaymentReceiptEmail,
}));
vi.mock("@/server/services/notifications", () => ({
  notifyOrgAdmins: h.notifyOrgAdmins,
}));

import { generateRecurringInvoice } from "@/inngest/functions/recurring-invoices";

function buildRec(overrides: Record<string, unknown> = {}): any {
  return {
    id: "rec_1",
    organizationId: "org_1",
    frequency: "MONTHLY",
    interval: 1,
    nextRunAt: new Date("2026-06-01T00:00:00Z"),
    maxOccurrences: null,
    occurrenceCount: 0,
    autoSend: false,
    autoCharge: true,
    invoice: {
      type: "DETAILED",
      date: new Date("2026-05-01T00:00:00Z"),
      dueDate: null,
      currencyId: "cur_1",
      exchangeRate: 1,
      simpleAmount: null,
      notes: null,
      subtotal: 100,
      discountTotal: 0,
      taxTotal: 0,
      total: 100,
      clientId: "client_1",
      organizationId: "org_1",
      lines: [],
    },
    ...overrides,
  };
}

describe("generateRecurringInvoice → autopay wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.tx.organization.findUniqueOrThrow.mockResolvedValue({
      id: "org_1",
      invoicePrefix: "INV",
      invoiceNextNumber: 5,
    });
    h.tx.organization.update.mockResolvedValue({});
    h.tx.invoice.create.mockResolvedValue({
      id: "inv_generated_1",
      number: "INV-0005",
      lines: [],
    });
    h.tx.recurringInvoice.update.mockResolvedValue({});
    h.tx.auditLog.create.mockResolvedValue({});
    h.attemptRecurringInvoiceAutopay.mockResolvedValue({
      status: "SUCCEEDED",
      attemptId: "att_1",
      processorId: "pi_1",
    });
  });

  it("passes the generated invoice id and recurring context into autopay", async () => {
    const result = await generateRecurringInvoice(buildRec());

    expect(h.attemptRecurringInvoiceAutopay).toHaveBeenCalledTimes(1);
    expect(h.attemptRecurringInvoiceAutopay).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: "inv_generated_1",
        recurringInvoiceId: "rec_1",
        autoCharge: true,
      }),
    );
    // The bug: recurringInvoiceId must be the recurring config id, never undefined.
    const arg = h.attemptRecurringInvoiceAutopay.mock.calls[0][0];
    expect(arg.recurringInvoiceId).toBe("rec_1");
    expect(result.autoCharged).toBe(1);
  });

  it("does not attempt autopay when the recurring config has autoCharge off", async () => {
    const result = await generateRecurringInvoice(buildRec({ autoCharge: false }));

    expect(h.attemptRecurringInvoiceAutopay).not.toHaveBeenCalled();
    expect(result.autoCharged).toBe(0);
  });
});
