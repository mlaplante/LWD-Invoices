import { describe, it, expect, beforeEach, vi } from "vitest";

const cookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockImplementation(async () => ({ set: cookieSet, get: vi.fn() })),
  headers: vi.fn().mockResolvedValue(new Map([["host", "localhost:3000"]])),
}));

vi.mock("@/server/services/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

import { clientsRouter } from "@/server/routers/clients";
import { invoicesRouter } from "@/server/routers/invoices";
import { logAudit } from "@/server/services/audit";
import { createMockContext } from "./mocks/trpc-context";
import { verifyPortalSession } from "@/lib/portal-session";
import { hashToken } from "@/lib/secure-token";

process.env.PORTAL_SESSION_SECRET = "test-portal-session-secret-32chars!";

describe("clients.previewPortal (view as client)", () => {
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    ctx.db.client.findFirst.mockResolvedValue({
      id: "client1",
      name: "Acme Co",
      portalToken: "ptok-client",
    });
    ctx.db.clientPortalSession.create.mockResolvedValue({});
  });

  it("creates a short-lived dashboard session and sets the portal cookie", async () => {
    const caller = clientsRouter.createCaller(ctx as never);
    const out = await caller.previewPortal({ id: "client1" });

    expect(out.url).toBe("/portal/dashboard/ptok-client");

    // Session is scoped to the client, marked as an admin preview, and short-lived.
    const session = ctx.db.clientPortalSession.create.mock.calls[0][0].data;
    expect(session.clientId).toBe("client1");
    expect(session.userAgent).toBe("admin-preview");
    const ttlMs = session.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeLessThanOrEqual(60 * 60_000);

    // The cookie matches what the passphrase gate would set: the plaintext
    // token goes in the cookie, only its SHA-256 digest is stored.
    const [name, value, opts] = cookieSet.mock.calls[0];
    expect(name).toBe("portal_dashboard_ptok-client");
    expect(session.token).toBe(hashToken(value));
    expect(opts).toMatchObject({
      httpOnly: true,
      path: "/",
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "VIEWED",
        entityType: "Client.Portal",
        diff: { event: "portal_admin_preview" },
        organizationId: "test-org-123",
      }),
    );
  });

  it("only resolves clients inside the caller's org", async () => {
    const caller = clientsRouter.createCaller(ctx as never);
    await caller.previewPortal({ id: "client1" });
    expect(ctx.db.client.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "client1",
      organizationId: "test-org-123",
    });
  });

  it("rejects non-admin roles", async () => {
    const viewerCtx = createMockContext({ userRole: "VIEWER" });
    const caller = clientsRouter.createCaller(viewerCtx as never);
    await expect(caller.previewPortal({ id: "client1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(cookieSet).not.toHaveBeenCalled();
  });
});

describe("invoices.previewPortal (view as client)", () => {
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    ctx.db.invoice.findFirst.mockResolvedValue({
      id: "inv1",
      number: "INV-0001",
      portalToken: "ptok-invoice",
    });
  });

  it("sets the signed invoice portal cookie and returns the portal URL", async () => {
    const caller = invoicesRouter.createCaller(ctx as never);
    const out = await caller.previewPortal({ id: "inv1" });

    expect(out.url).toBe("/portal/ptok-invoice");

    const [name, value, opts] = cookieSet.mock.calls[0];
    expect(name).toBe("portal_auth_ptok-invoice");
    // The cookie value must pass the same verification the portal layout runs.
    expect(
      verifyPortalSession(value, "ptok-invoice", process.env.PORTAL_SESSION_SECRET!),
    ).toBe(true);
    expect(opts).toMatchObject({
      httpOnly: true,
      maxAge: 3600,
      path: "/",
    });
  });

  it("404s for invoices outside the caller's org", async () => {
    ctx.db.invoice.findFirst.mockResolvedValue(null);
    const caller = invoicesRouter.createCaller(ctx as never);
    await expect(caller.previewPortal({ id: "other-org-inv" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("rejects non-admin roles", async () => {
    const viewerCtx = createMockContext({ userRole: "ACCOUNTANT" });
    const caller = invoicesRouter.createCaller(viewerCtx as never);
    await expect(caller.previewPortal({ id: "inv1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
