import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    gatewaySetting: { findUnique: vi.fn() },
    invoice: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/server/services/encryption", () => ({
  decryptJson: vi.fn(() => ({ webhookId: "wh_test", sandbox: true, clientId: "cl", clientSecret: "cs" })),
}));

vi.mock("@/server/services/paypal", () => ({
  verifyPayPalWebhook: vi.fn(),
  getPayPalAccessToken: vi.fn(),
}));

import { POST } from "@/app/api/webhooks/paypal/route";
import { db } from "@/server/db";
import { verifyPayPalWebhook } from "@/server/services/paypal";

const GATEWAY = { isEnabled: true, configJson: "enc" };
const CUSTOM_ID = JSON.stringify({ invoiceId: "inv1", orgId: "org1" });

const BODY = JSON.stringify({
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: { custom_id: CUSTOM_ID, id: "cap1", amount: { value: "100.00" } },
});

const mockTx = {
  payment: { create: vi.fn() },
  invoice: { update: vi.fn() },
};

function makeReq(body = BODY) {
  return new Request("http://localhost/api/webhooks/paypal", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

describe("PayPal webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.payment.create.mockResolvedValue({});
    mockTx.invoice.update.mockResolvedValue({});
    vi.mocked(db.gatewaySetting.findUnique).mockResolvedValue(GATEWAY as any);
    vi.mocked(verifyPayPalWebhook).mockResolvedValue(true);
  });

  it("returns 400 when custom_id is missing from resource", async () => {
    const res = await POST(makeReq(JSON.stringify({ resource: {} })) as any);
    expect(res.status).toBe(400);
  });

  it("returns 200 without $transaction when invoice is already PAID (idempotency)", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue({
      id: "inv1",
      total: { toNumber: () => 100 },
      status: "PAID",
    } as any);

    const res = await POST(makeReq() as any);
    expect(res.status).toBe(200);
    expect(vi.mocked(db.$transaction)).not.toHaveBeenCalled();
  });

  it("calls $transaction to record payment for an unpaid invoice", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue({
      id: "inv1",
      total: { toNumber: () => 100 },
      status: "SENT",
    } as any);
    vi.mocked(db.$transaction).mockImplementation((fn: any) => fn(mockTx));

    const res = await POST(makeReq() as any);
    expect(res.status).toBe(200);
    expect(vi.mocked(db.$transaction)).toHaveBeenCalled();
    expect(mockTx.payment.create).toHaveBeenCalled();
  });
});
