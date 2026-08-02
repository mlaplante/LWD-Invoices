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
    cookieGet.mockReturnValue({ value: signPortalSession(TOKEN, SECRET) });

    const res = await caller.getInvoice({ token: TOKEN });
    expect(res.invoice.id).toBe("inv-1");
  });
});
