import { describe, it, expect, beforeEach, vi } from "vitest";
import { portalRouter } from "@/server/routers/portal";
import { createMockContext } from "./mocks/trpc-context";
import { Decimal } from "@prisma/client-runtime-utils";

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
  },
}));

// Mock portal-dashboard helpers
vi.mock("@/server/services/portal-dashboard", () => ({
  generateSessionToken: vi.fn(() => "mock-session-token-abc123"),
  SESSION_DURATION_MS: 30 * 24 * 60 * 60 * 1000,
  isSessionExpired: vi.fn(),
}));

import bcrypt from "bcryptjs";
import { isSessionExpired } from "@/server/services/portal-dashboard";

describe("Portal Dashboard Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = portalRouter.createCaller(ctx);
    vi.clearAllMocks();
  });

  describe("createDashboardSession", () => {
    it("creates session for valid client portal token", async () => {
      const mockClient = {
        id: "client-1",
        portalToken: "valid-portal-token",
        portalPassphraseHash: null,
        name: "Test Client",
      };

      ctx.db.client.findUnique.mockResolvedValue(mockClient);
      ctx.db.clientPortalSession.create.mockResolvedValue({
        id: "session-1",
        token: "mock-session-token-abc123",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        clientId: "client-1",
      });

      const result = await caller.createDashboardSession({
        clientToken: "valid-portal-token",
      });

      expect(result.sessionToken).toBe("mock-session-token-abc123");
      expect(ctx.db.client.findUnique).toHaveBeenCalledWith({
        where: { portalToken: "valid-portal-token" },
        select: { id: true, portalPassphraseHash: true },
      });
      expect(ctx.db.clientPortalSession.create).toHaveBeenCalled();
    });

    it("throws NOT_FOUND for invalid client token", async () => {
      ctx.db.client.findUnique.mockResolvedValue(null);

      await expect(
        caller.createDashboardSession({ clientToken: "bad-token" })
      ).rejects.toThrow("NOT_FOUND");
    });

    it("verifies passphrase when portalPassphraseHash is set", async () => {
      const mockClient = {
        id: "client-1",
        portalPassphraseHash: "$2a$10$hashedvalue",
      };

      ctx.db.client.findUnique.mockResolvedValue(mockClient);
      (bcrypt.compare as any).mockResolvedValue(true);
      ctx.db.clientPortalSession.create.mockResolvedValue({
        id: "session-1",
        token: "mock-session-token-abc123",
        expiresAt: new Date(),
        clientId: "client-1",
      });

      const result = await caller.createDashboardSession({
        clientToken: "valid-token",
        passphrase: "secret123",
      });

      expect(result.sessionToken).toBe("mock-session-token-abc123");
      expect(bcrypt.compare).toHaveBeenCalledWith("secret123", "$2a$10$hashedvalue");
    });

    it("throws UNAUTHORIZED for wrong passphrase", async () => {
      const mockClient = {
        id: "client-1",
        portalPassphraseHash: "$2a$10$hashedvalue",
      };

      ctx.db.client.findUnique.mockResolvedValue(mockClient);
      (bcrypt.compare as any).mockResolvedValue(false);

      await expect(
        caller.createDashboardSession({
          clientToken: "valid-token",
          passphrase: "wrong-pass",
        })
      ).rejects.toThrow("UNAUTHORIZED");
    });
  });

  describe("getDashboard", () => {
    const mockSession = {
      id: "session-1",
      token: "valid-session-token",
      expiresAt: new Date(Date.now() + 86400000),
      clientId: "client-1",
    };

    const mockClient = {
      id: "client-1",
      name: "Acme Corp",
      email: "acme@example.com",
      organizationId: "org-1",
      organization: { name: "My Biz", logoUrl: "https://logo.png" },
    };

    it("returns client summary with invoices, projects, payments for valid session", async () => {
      (isSessionExpired as any).mockReturnValue(false);
      ctx.db.clientPortalSession.findUnique.mockResolvedValue(mockSession);
      ctx.db.client.findUnique.mockResolvedValue(mockClient);
      ctx.db.invoice.findMany.mockResolvedValue([
        {
          id: "inv-1",
          number: "INV-001",
          status: "SENT",
          total: new Decimal("1000.00"),
          date: new Date(),
          dueDate: new Date(Date.now() + 86400000),
          isArchived: false,
          currency: { symbol: "$", symbolPosition: "BEFORE" },
          payments: [{ amount: new Decimal("200.00") }],
        },
        {
          id: "inv-2",
          number: "INV-002",
          status: "OVERDUE",
          total: new Decimal("500.00"),
          date: new Date(),
          dueDate: new Date(Date.now() - 86400000),
          isArchived: false,
          currency: { symbol: "$", symbolPosition: "BEFORE" },
          payments: [],
        },
      ]);
      ctx.db.project.findMany.mockResolvedValue([
        {
          id: "proj-1",
          name: "Website Redesign",
          status: "ACTIVE",
          dueDate: new Date(),
        },
      ]);
      ctx.db.payment.findMany.mockResolvedValue([
        {
          id: "pay-1",
          amount: new Decimal("200.00"),
          paidAt: new Date(),
          method: "STRIPE",
          invoice: { number: "INV-001", currency: { symbol: "$", symbolPosition: "BEFORE" } },
        },
      ]);

      const result = await caller.getDashboard({
        sessionToken: "valid-session-token",
      });

      expect(result.client.name).toBe("Acme Corp");
      expect(result.invoices).toHaveLength(2);
      expect(result.projects).toHaveLength(1);
      expect(result.recentPayments).toHaveLength(1);
      // outstanding = (1000 - 200) + 500 = 1300
      expect(result.summary.outstanding).toBe(1300);
      // overdue = 500 (only inv-2 is OVERDUE status)
      expect(result.summary.overdue).toBe(500);
    });

    it("throws NOT_FOUND for invalid session token", async () => {
      ctx.db.clientPortalSession.findUnique.mockResolvedValue(null);

      await expect(
        caller.getDashboard({ sessionToken: "bad-token" })
      ).rejects.toThrow("NOT_FOUND");
    });

    it("throws UNAUTHORIZED for expired session", async () => {
      const expiredSession = {
        ...mockSession,
        expiresAt: new Date(Date.now() - 86400000),
      };
      ctx.db.clientPortalSession.findUnique.mockResolvedValue(expiredSession);
      (isSessionExpired as any).mockReturnValue(true);

      await expect(
        caller.getDashboard({ sessionToken: "expired-token" })
      ).rejects.toThrow("UNAUTHORIZED");
    });
  });
});
