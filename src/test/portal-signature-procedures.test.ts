import { describe, it, expect, beforeEach, vi } from "vitest";
import { portalRouter } from "@/server/routers/portal";
import { createMockContext } from "./mocks/trpc-context";
import { InvoiceType, InvoiceStatus } from "@/generated/prisma";

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
  },
}));

// Mock portal-dashboard helpers
vi.mock("@/server/services/portal-dashboard", () => ({
  generateSessionToken: vi.fn(() => "mock-session-token"),
  SESSION_DURATION_MS: 30 * 24 * 60 * 60 * 1000,
  isSessionExpired: vi.fn(),
}));

// Mock signature helpers - keep real validation, mock encryption
vi.mock("@/server/services/signature", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/signature")>(
    "@/server/services/signature"
  );
  return {
    ...actual,
    encryptSignature: vi.fn(() => "encrypted-signature-data"),
  };
});

// Mock stripe
vi.mock("@/server/services/stripe", () => ({
  getStripeClient: vi.fn(),
  createCheckoutSession: vi.fn(),
}));

// Mock notifications (dynamic import)
vi.mock("@/server/services/notifications", () => ({
  notifyOrgAdmins: vi.fn(),
}));

describe("Portal Signature Procedures", () => {
  let ctx: any;
  let caller: any;

  const validSignatureData = "data:image/png;base64,iVBORw0KGgo=";

  const mockInvoice = {
    id: "inv-1",
    number: "EST-001",
    type: InvoiceType.ESTIMATE,
    status: InvoiceStatus.SENT,
    signedAt: null,
    organizationId: "org-1",
    portalToken: "test-portal-token",
    proposalContent: {
      id: "pc-1",
      sections: [
        { key: "intro", title: "Introduction", content: "Hello" },
        { key: "scope", title: "Scope", content: "Work details" },
      ],
    },
    client: { name: "Test Client" },
    organization: {
      name: "Test Org",
      users: [{ email: "admin@test.com", id: "user-1", role: "ADMIN" }],
    },
  };

  beforeEach(() => {
    ctx = createMockContext();
    caller = portalRouter.createCaller(ctx);
    vi.clearAllMocks();
  });

  describe("signProposal", () => {
    it("signs a proposal and returns ACCEPTED status", async () => {
      const now = new Date();
      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.invoice.update.mockResolvedValue({
        ...mockInvoice,
        status: InvoiceStatus.ACCEPTED,
        signedAt: now,
      });
      ctx.db.signatureAuditLog.create.mockResolvedValue({ id: "sal-1" });

      const result = await caller.signProposal({
        token: "test-portal-token",
        signedByName: "John Doe",
        signedByEmail: "john@example.com",
        signatureData: validSignatureData,
        legalConsent: true as const,
      });

      expect(result.status).toBe(InvoiceStatus.ACCEPTED);
      expect(result.signedAt).toBe(now);

      // Verify invoice was updated
      expect(ctx.db.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inv-1" },
          data: expect.objectContaining({
            signedByName: "John Doe",
            signedByEmail: "john@example.com",
            signatureData: "encrypted-signature-data",
            status: InvoiceStatus.ACCEPTED,
          }),
        })
      );

      // Verify audit log was created
      expect(ctx.db.signatureAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          invoiceId: "inv-1",
          organizationId: "org-1",
          signedByName: "John Doe",
          signedByEmail: "john@example.com",
          documentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          signatureHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      });
    });

    it("rejects if proposal is already signed (CONFLICT)", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue({
        ...mockInvoice,
        signedAt: new Date("2026-03-01"),
      });

      await expect(
        caller.signProposal({
          token: "test-portal-token",
          signedByName: "John Doe",
          signedByEmail: "john@example.com",
          signatureData: validSignatureData,
          legalConsent: true as const,
        })
      ).rejects.toThrow("This proposal has already been signed");

      expect(ctx.db.invoice.update).not.toHaveBeenCalled();
    });

    it("rejects without legal consent (Zod validation)", async () => {
      await expect(
        caller.signProposal({
          token: "test-portal-token",
          signedByName: "John Doe",
          signedByEmail: "john@example.com",
          signatureData: validSignatureData,
          legalConsent: false as any,
        })
      ).rejects.toThrow();
    });

    it("rejects invalid signature data", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);

      await expect(
        caller.signProposal({
          token: "test-portal-token",
          signedByName: "John Doe",
          signedByEmail: "john@example.com",
          signatureData: "<script>alert('xss')</script>",
          legalConsent: true as const,
        })
      ).rejects.toThrow("Invalid signature data");
    });

    it("rejects non-ESTIMATE invoice types", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue({
        ...mockInvoice,
        type: InvoiceType.DETAILED,
      });

      await expect(
        caller.signProposal({
          token: "test-portal-token",
          signedByName: "John Doe",
          signedByEmail: "john@example.com",
          signatureData: validSignatureData,
          legalConsent: true as const,
        })
      ).rejects.toThrow("Only estimates/proposals can be signed");
    });

    it("throws NOT_FOUND for invalid token", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(null);

      await expect(
        caller.signProposal({
          token: "invalid-token",
          signedByName: "John Doe",
          signedByEmail: "john@example.com",
          signatureData: validSignatureData,
          legalConsent: true as const,
        })
      ).rejects.toThrow();
    });

    it("succeeds even if notification fails", async () => {
      const now = new Date();
      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.invoice.update.mockResolvedValue({
        ...mockInvoice,
        status: InvoiceStatus.ACCEPTED,
        signedAt: now,
      });
      ctx.db.signatureAuditLog.create.mockResolvedValue({ id: "sal-1" });

      // Notification module will throw
      const notifications = await import("@/server/services/notifications");
      (notifications.notifyOrgAdmins as any).mockRejectedValue(new Error("Email failed"));

      const result = await caller.signProposal({
        token: "test-portal-token",
        signedByName: "John Doe",
        signedByEmail: "john@example.com",
        signatureData: validSignatureData,
        legalConsent: true as const,
      });

      // Should still succeed
      expect(result.status).toBe(InvoiceStatus.ACCEPTED);
    });

    it("handles proposal with no sections gracefully", async () => {
      const invoiceNoSections = {
        ...mockInvoice,
        proposalContent: null,
      };
      const now = new Date();
      ctx.db.invoice.findUnique.mockResolvedValue(invoiceNoSections);
      ctx.db.invoice.update.mockResolvedValue({
        ...invoiceNoSections,
        status: InvoiceStatus.ACCEPTED,
        signedAt: now,
      });
      ctx.db.signatureAuditLog.create.mockResolvedValue({ id: "sal-1" });

      const result = await caller.signProposal({
        token: "test-portal-token",
        signedByName: "John Doe",
        signedByEmail: "john@example.com",
        signatureData: validSignatureData,
        legalConsent: true as const,
      });

      expect(result.status).toBe(InvoiceStatus.ACCEPTED);
    });
  });
});
