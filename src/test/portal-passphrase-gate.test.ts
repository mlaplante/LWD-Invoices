import { describe, it, expect, beforeEach, vi } from "vitest";

// Controllable cookie store for the portal session cookie.
const cookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockImplementation(async () => ({ get: cookieGet })),
}));

// Module-level service mocks so importing portalRouter has no side effects.
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));
vi.mock("@/server/services/portal-dashboard", () => ({
  generateSessionToken: vi.fn(() => "mock-session-token"),
  SESSION_DURATION_MS: 30 * 24 * 60 * 60 * 1000,
  isSessionExpired: vi.fn(),
}));
vi.mock("@/server/services/signature", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/signature")>(
    "@/server/services/signature",
  );
  return { ...actual, encryptSignature: vi.fn(() => "encrypted-signature-data") };
});
vi.mock("@/server/services/encryption", () => ({
  encryptJson: vi.fn(),
  decryptJson: vi.fn(),
}));
vi.mock("@/server/services/stripe", () => ({
  getStripeClient: vi.fn(),
  createCheckoutSession: vi.fn(),
}));
vi.mock("@/server/services/notifications", () => ({ notifyOrgAdmins: vi.fn() }));

process.env.PORTAL_SESSION_SECRET = "test-portal-session-secret-32chars!";

import { portalRouter } from "@/server/routers/portal";
import { createMockContext } from "./mocks/trpc-context";
import { signPortalSession } from "@/lib/portal-session";
import { InvoiceStatus } from "@/generated/prisma";
import { Decimal } from "@prisma/client-runtime-utils";

const TOKEN = "gated-token";
const SECRET = process.env.PORTAL_SESSION_SECRET!;

// The gate reads client.portalPassphraseHash; getInvoiceByToken reads the full
// invoice. A single findUnique mock satisfies both calls.
function makeInvoice(portalPassphraseHash: string | null) {
  return {
    id: "inv-1",
    number: "INV-1",
    status: InvoiceStatus.SENT,
    total: new Decimal("100.00"),
    portalToken: TOKEN,
    organizationId: "org-1",
    clientId: "client-1",
    client: { id: "client-1", name: "Client", email: "c@t.com", portalPassphraseHash },
    currency: { id: "cur-1", code: "USD", symbol: "$", symbolPosition: "BEFORE" },
    organization: { id: "org-1", name: "Org" },
    lines: [],
    payments: [],
    partialPayments: [],
  };
}

describe("portal passphrase gate (requireInvoicePortalSession)", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    caller = portalRouter.createCaller(ctx);
    ctx.db.gatewaySetting.findMany.mockResolvedValue([]);
    ctx.db.comment.findMany.mockResolvedValue([]);
  });

  it("allows getInvoice when the client has no passphrase (link is the credential)", async () => {
    ctx.db.invoice.findUnique.mockResolvedValue(makeInvoice(null));
    cookieGet.mockReturnValue(undefined);

    const res = await caller.getInvoice({ token: TOKEN });
    expect(res.invoice.id).toBe("inv-1");
  });

  it("rejects getInvoice when a passphrase is set but no session cookie is presented", async () => {
    ctx.db.invoice.findUnique.mockResolvedValue(makeInvoice("$2b$10$abcdefghijklmnopqrstuv"));
    cookieGet.mockReturnValue(undefined);

    await expect(caller.getInvoice({ token: TOKEN })).rejects.toThrow("UNAUTHORIZED");
  });

  it("rejects getInvoice when the presented session cookie is invalid", async () => {
    ctx.db.invoice.findUnique.mockResolvedValue(makeInvoice("$2b$10$abcdefghijklmnopqrstuv"));
    cookieGet.mockReturnValue({ value: "not-a-valid-signed-cookie" });

    await expect(caller.getInvoice({ token: TOKEN })).rejects.toThrow("UNAUTHORIZED");
  });

  it("allows getInvoice when a valid portal session cookie is presented", async () => {
    ctx.db.invoice.findUnique.mockResolvedValue(makeInvoice("$2b$10$abcdefghijklmnopqrstuv"));
    cookieGet.mockReturnValue({
      value: signPortalSession(TOKEN, SECRET, undefined, "$2b$10$abcdefghijklmnopqrstuv"),
    });

    const res = await caller.getInvoice({ token: TOKEN });
    expect(res.invoice.id).toBe("inv-1");
  });

  // A passphrase reset must revoke sessions minted under the old passphrase:
  // the cookie is bound to the hash it was issued for.
  it("rejects a session cookie issued under a previous passphrase", async () => {
    ctx.db.invoice.findUnique.mockResolvedValue(makeInvoice("$2b$10$NEWHASHAFTERRESETxxxxxx"));
    cookieGet.mockReturnValue({
      value: signPortalSession(TOKEN, SECRET, undefined, "$2b$10$abcdefghijklmnopqrstuv"),
    });

    await expect(caller.getInvoice({ token: TOKEN })).rejects.toThrow("UNAUTHORIZED");
  });

  it("rejects a legacy cookie that isn't bound to any passphrase", async () => {
    ctx.db.invoice.findUnique.mockResolvedValue(makeInvoice("$2b$10$abcdefghijklmnopqrstuv"));
    cookieGet.mockReturnValue({ value: signPortalSession(TOKEN, SECRET) });

    await expect(caller.getInvoice({ token: TOKEN })).rejects.toThrow("UNAUTHORIZED");
  });
});

describe("portal.getInvoice redaction", () => {
  it("drops internal bookkeeping fields from the public response", async () => {
    const ctx = createMockContext();
    ctx.db.invoice.findUnique.mockResolvedValue({
      ...makeInvoice(null),
      signedByIp: "203.0.113.7",
      scheduledSendCc: ["boss@internal.test"],
      reminderSequenceId: "seq-1",
      payments: [
        { id: "p1", amount: 10, notes: "client is slow to pay", transactionId: "pi_123", gatewayFee: 0.59 },
      ],
      lines: [{ id: "l1", name: "Work", sourceTable: "TimeEntry", sourceId: "te-1" }],
    });
    ctx.db.gatewaySetting.findMany.mockResolvedValue([]);
    ctx.db.comment.findMany.mockResolvedValue([]);

    const res = await portalRouter.createCaller(ctx).getInvoice({ token: TOKEN });
    const json = JSON.stringify(res.invoice);
    for (const leaked of ["203.0.113.7", "boss@internal.test", "seq-1", "slow to pay", "pi_123", "te-1"]) {
      expect(json).not.toContain(leaked);
    }
    expect(res.invoice.payments[0]).toMatchObject({ id: "p1", amount: 10 });
    expect(res.invoice.lines[0]).toMatchObject({ id: "l1", name: "Work" });
  });
});
