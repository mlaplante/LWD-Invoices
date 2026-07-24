import { vi, describe, it, expect, beforeEach } from "vitest";

// The route only uses the Svix signature to prove the payload came from
// Resend; for these tests we don't need a real signature, just a verify()
// that hands back the parsed body.
vi.mock("svix", () => ({
  Webhook: class {
    verify(rawBody: string) {
      return JSON.parse(rawBody);
    }
  },
}));

vi.mock("@/server/db", () => ({
  db: {
    inboundEmail: { findFirst: vi.fn(), create: vi.fn() },
    invoice: { findUnique: vi.fn() },
    ticket: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    ticketMessage: { create: vi.fn() },
  },
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

import { POST } from "@/app/api/webhooks/inbound-email/route";
import { db } from "@/server/db";
import { inngest } from "@/inngest/client";

const INVOICE = {
  id: "inv1",
  number: "2026-0001",
  organizationId: "org1",
  clientId: "client1",
  client: { email: "client@acme.com" },
};

function makeReq(from: string, messageId: string) {
  const body = JSON.stringify({
    data: {
      from,
      to: ["reply+inv1@inbound.example.com"],
      subject: "Re: Invoice 2026-0001",
      text: "hello",
      message_id: messageId,
    },
  });
  return new Request("http://localhost/api/webhooks/inbound-email", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "svix-id": "id",
      "svix-timestamp": "1",
      "svix-signature": "sig",
    },
  });
}

describe("Inbound email webhook — sender verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_INBOUND_WEBHOOK_SECRET = "whsec_test";
    vi.mocked(db.inboundEmail.findFirst).mockResolvedValue(null as any);
    vi.mocked(db.invoice.findUnique).mockResolvedValue(INVOICE as any);
    vi.mocked(db.ticket.findFirst).mockResolvedValue(null as any);
    vi.mocked(db.ticket.create).mockResolvedValue({ id: "ticket1" } as any);
    vi.mocked(db.inboundEmail.create).mockResolvedValue({ id: "ibe1" } as any);
    vi.mocked(inngest.send).mockResolvedValue(undefined as any);
  });

  it("drops a forged/mismatched From without threading or notifying", async () => {
    const res = await POST(makeReq("mallory@evil.com", "<msg1>") as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.threaded).toBe(false);

    expect(db.ticket.create).not.toHaveBeenCalled();
    expect(db.ticketMessage.create).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();

    // The audit row is still persisted, unattached to any ticket.
    expect(db.inboundEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ticketId: null, fromEmail: "mallory@evil.com" }),
      }),
    );
  });

  it("threads a bare-address match from the real client", async () => {
    const res = await POST(makeReq("client@acme.com", "<msg2>") as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.threaded).toBe(true);

    expect(db.ticket.create).toHaveBeenCalled();
    expect(inngest.send).toHaveBeenCalled();
  });

  it("threads a display-name From that wraps the client's address", async () => {
    const res = await POST(makeReq('"Client Name" <client@acme.com>', "<msg3>") as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.threaded).toBe(true);

    expect(db.ticket.create).toHaveBeenCalled();
    expect(inngest.send).toHaveBeenCalled();
  });

  it("threads case-insensitively and trims whitespace", async () => {
    const res = await POST(makeReq("  CLIENT@ACME.COM  ", "<msg4>") as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.threaded).toBe(true);
  });

  it("fails closed when the client has no stored email on file", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue({
      ...INVOICE,
      client: { email: null },
    } as any);

    const res = await POST(makeReq("client@acme.com", "<msg5>") as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.threaded).toBe(false);

    expect(db.ticket.create).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });
});
