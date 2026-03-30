import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    gatewaySetting: { findUnique: vi.fn() },
    invoice: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/server/services/encryption", () => ({
  decryptJson: vi.fn(() => ({ webhookSecret: "whsec_test" })),
}));

vi.mock("@/server/services/stripe", () => ({
  constructStripeEvent: vi.fn(),
}));

import { POST } from "@/app/api/webhooks/stripe/route";
import { db } from "@/server/db";
import { constructStripeEvent } from "@/server/services/stripe";

const GATEWAY = { isEnabled: true, configJson: "enc" };

const mockTx = {
  payment: { create: vi.fn() },
  invoice: { update: vi.fn() },
  partialPayment: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
};

function makeBody(meta: Record<string, string> = { orgId: "org1", invoiceId: "inv1" }) {
  return JSON.stringify({ data: { object: { metadata: meta } } });
}

function makeReq(body: string, sig: string | null = "stripe-sig") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sig !== null) headers["stripe-signature"] = sig;
  return new Request("http://localhost/api/webhooks/stripe", { method: "POST", body, headers });
}

describe("Stripe webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.payment.create.mockResolvedValue({});
    mockTx.invoice.update.mockResolvedValue({});
    vi.mocked(db.gatewaySetting.findUnique).mockResolvedValue(GATEWAY as any);
    vi.mocked(constructStripeEvent).mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { orgId: "org1", invoiceId: "inv1" },
          amount_total: 10000,
          payment_intent: "pi_test",
          id: "cs_test",
        },
      },
    } as any);
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    const res = await POST(makeReq(makeBody(), null) as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when orgId is absent from event metadata", async () => {
    const res = await POST(makeReq(JSON.stringify({ data: { object: {} } })) as any);
    expect(res.status).toBe(400);
  });

  it("returns 200 without $transaction when invoice is already PAID (idempotency)", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue({
      id: "inv1",
      total: { toNumber: () => 100 },
      status: "PAID",
      partialPayments: [],
      payments: [],
    } as any);

    const res = await POST(makeReq(makeBody()) as any);
    expect(res.status).toBe(200);
    expect(vi.mocked(db.$transaction)).not.toHaveBeenCalled();
  });

  it("calls $transaction to record payment for an unpaid invoice", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue({
      id: "inv1",
      total: { toNumber: () => 100 },
      status: "SENT",
      partialPayments: [],
      payments: [],
    } as any);
    mockTx.partialPayment.updateMany.mockResolvedValue({ count: 0 });
    vi.mocked(db.$transaction).mockImplementation((fn: any) => fn(mockTx));

    const res = await POST(makeReq(makeBody()) as any);
    expect(res.status).toBe(200);
    expect(vi.mocked(db.$transaction)).toHaveBeenCalled();
    expect(mockTx.payment.create).toHaveBeenCalled();
  });
});
