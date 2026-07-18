import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  inboundEmail: { findFirst: vi.fn() },
  inboundEmailTriage: { create: vi.fn() },
  assertAiRateLimit: vi.fn(),
  classifyReply: vi.fn(),
  notifyOrgAdmins: vi.fn(),
}));

// Return the function handler so each test can exercise the created Inngest function.
vi.mock("@/inngest/client", () => ({
  inngest: { createFunction: vi.fn((_config: unknown, handler: unknown) => handler) },
}));
vi.mock("@/server/db", () => ({
  db: { inboundEmail: h.inboundEmail, inboundEmailTriage: h.inboundEmailTriage },
}));
vi.mock("@/server/lib/ai-rate-limit", () => ({ assertAiRateLimit: h.assertAiRateLimit }));
vi.mock("@/server/services/reply-triage", () => ({ classifyReply: h.classifyReply }));
vi.mock("@/server/services/notifications", () => ({ notifyOrgAdmins: h.notifyOrgAdmins }));

import { triageInboundReply } from "@/inngest/functions/client-reply-triage";

const run = (inboundEmailId = "email_1", organizationId = "org_1") =>
  (triageInboundReply as unknown as (input: { event: { data: { inboundEmailId: string; organizationId: string } } }) => Promise<unknown>)({
    event: { data: { inboundEmailId, organizationId } },
  });

function email(overrides: Record<string, unknown> = {}) {
  return {
    id: "email_1",
    organizationId: "org_1",
    bodyText: "I dispute this invoice.",
    subject: "Invoice question",
    fromEmail: "client@example.test",
    invoiceId: "inv_1",
    triage: null,
    invoice: { number: "INV-100", total: 250, dueDate: new Date("2026-07-01"), status: "SENT" },
    ...overrides,
  };
}

describe("triageInboundReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.inboundEmailTriage.create.mockResolvedValue({ id: "triage_1" });
    h.notifyOrgAdmins.mockResolvedValue(undefined);
  });

  it("skips an inbound email that already has triage (idempotency)", async () => {
    h.inboundEmail.findFirst.mockResolvedValue(email({ triage: { id: "triage_existing" } }));

    await expect(run()).resolves.toEqual({ skipped: "already-triaged" });
    expect(h.classifyReply).not.toHaveBeenCalled();
    expect(h.inboundEmailTriage.create).not.toHaveBeenCalled();
  });

  it("skips when the inbound email no longer exists", async () => {
    h.inboundEmail.findFirst.mockResolvedValue(null);

    await expect(run()).resolves.toEqual({ skipped: "already-triaged" });
    expect(h.classifyReply).not.toHaveBeenCalled();
    expect(h.inboundEmailTriage.create).not.toHaveBeenCalled();
  });

  it("does not create triage when classification is skipped for a keyless org", async () => {
    h.inboundEmail.findFirst.mockResolvedValue(email());
    h.classifyReply.mockResolvedValue({ skipped: true });

    await expect(run()).resolves.toEqual({ skipped: true });
    expect(h.inboundEmailTriage.create).not.toHaveBeenCalled();
  });

  it("creates AI dispute triage and notifies org admins", async () => {
    h.inboundEmail.findFirst.mockResolvedValue(email());
    h.classifyReply.mockResolvedValue({
      category: "DISPUTE", confidence: 0.92, reasoning: "The client disputes the charge.", promisedDate: null, source: "ai",
    });

    await expect(run()).resolves.toEqual({ id: "triage_1" });
    expect(h.inboundEmailTriage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ inboundEmailId: "email_1", organizationId: "org_1", category: "DISPUTE", source: "ai" }),
    });
    expect(h.notifyOrgAdmins).toHaveBeenCalledWith("org_1", expect.objectContaining({
      type: "TICKET_REPLIED", title: "Client reply: dispute raised", link: "/invoices/inv_1",
    }));
  });

  it("creates low-confidence fallback triage without notifying admins", async () => {
    h.inboundEmail.findFirst.mockResolvedValue(email());
    h.classifyReply.mockResolvedValue({
      category: "NEEDS_REVIEW", confidence: 0.4, reasoning: "Ambiguous reply.", promisedDate: null, source: "fallback_low_confidence",
    });

    await expect(run()).resolves.toEqual({ id: "triage_1" });
    expect(h.inboundEmailTriage.create).toHaveBeenCalledTimes(1);
    expect(h.notifyOrgAdmins).not.toHaveBeenCalled();
  });

  it("cleanly skips when the AI rate limit is exceeded", async () => {
    h.inboundEmail.findFirst.mockResolvedValue(email());
    h.assertAiRateLimit.mockImplementation(() => { throw new Error("rate limited"); });

    await expect(run()).resolves.toEqual({ skipped: "rate-limited" });
    expect(h.classifyReply).not.toHaveBeenCalled();
    expect(h.inboundEmailTriage.create).not.toHaveBeenCalled();
  });
});
