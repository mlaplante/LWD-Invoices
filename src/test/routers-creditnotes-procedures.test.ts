import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/server/services/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

import { creditNotesRouter, validateCreditApplication } from "@/server/routers/creditNotes";
import { createMockContext } from "./mocks/trpc-context";
import { InvoiceType } from "@/generated/prisma";

describe("Credit Notes Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = creditNotesRouter.createCaller(ctx);
  });

  describe("listForClient", () => {
    it("returns credit notes for specific client", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        name: "Test Org",
        slug: "test-org",
        logoUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      ctx.db.invoice.findMany.mockResolvedValue([
        {
          id: "cn_1",
          number: "CN-2026-0001",
          type: InvoiceType.CREDIT_NOTE,
          clientId: "c_1",
          organizationId: "test-org-123",
          isArchived: false,
          total: 500,
          status: "DRAFT",
          date: new Date(),
          dueDate: null,
          currencyId: "usd",
          exchangeRate: 1,
          simpleAmount: null,
          notes: null,
          subtotal: 500,
          discountTotal: 0,
          taxTotal: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          creditNotesIssued: [],
          currency: {
            id: "usd",
            symbol: "$",
            symbolPosition: "LEFT",
            code: "USD",
          },
        },
      ]);

      const result = await caller.listForClient({ clientId: "c_1" });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(InvoiceType.CREDIT_NOTE);
      expect(result[0].clientId).toBe("c_1");
      expect(result[0].isArchived).toBe(false);
      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "test-org-123",
          clientId: "c_1",
          type: InvoiceType.CREDIT_NOTE,
          isArchived: false,
        },
        include: {
          creditNotesIssued: true,
          currency: true,
        },
        orderBy: { createdAt: "desc" },
      });
    });

    it("excludes archived credit notes", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });

      ctx.db.invoice.findMany.mockResolvedValue([
        {
          id: "cn_active",
          number: "CN-2026-0001",
          type: InvoiceType.CREDIT_NOTE,
          clientId: "c_1",
          organizationId: "test-org-123",
          isArchived: false,
          total: 500,
          status: "DRAFT",
          creditNotesIssued: [],
          currency: { id: "usd", symbol: "$", symbolPosition: "LEFT" },
        },
      ]);

      const result = await caller.listForClient({ clientId: "c_1" });

      expect(result).toHaveLength(1);
      expect(result[0].isArchived).toBe(false);
    });
  });

  describe("applyToInvoice", () => {
    it("applies credit note to invoice successfully", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });

      ctx.db.invoice.findFirst
        .mockResolvedValueOnce({
          id: "cn_1",
          type: InvoiceType.CREDIT_NOTE,
          total: 1000,
          creditNoteStatus: "ISSUED",
          creditNotesIssued: [],
        })
        .mockResolvedValueOnce({
          id: "inv_1",
          number: "INV-001",
          total: 5000,
          payments: [],
          creditNotesReceived: [],
        });

      ctx.db.creditNoteApplication.create.mockResolvedValue({
        id: "cna_1",
        creditNoteId: "cn_1",
        invoiceId: "inv_1",
        amount: 500,
        organizationId: "test-org-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      ctx.db.auditLog.create.mockResolvedValue({});

      const result = await caller.applyToInvoice({
        creditNoteId: "cn_1",
        invoiceId: "inv_1",
        amount: 500,
      });

      expect(result.id).toBe("cna_1");
      expect(result.amount).toBe(500);
      expect(ctx.db.creditNoteApplication.create).toHaveBeenCalled();
    });

    it("throws error when amount exceeds credit remaining", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });

      ctx.db.invoice.findFirst
        .mockResolvedValueOnce({
          id: "cn_1",
          type: InvoiceType.CREDIT_NOTE,
          total: 1000,
          creditNoteStatus: "ISSUED",
          creditNotesIssued: [
            { amount: 800, id: "cna_1", creditNoteId: "cn_1", invoiceId: "inv_x" },
          ],
        })
        .mockResolvedValueOnce({
          id: "inv_1",
          total: 5000,
          payments: [],
          creditNotesReceived: [],
        });

      try {
        await caller.applyToInvoice({
          creditNoteId: "cn_1",
          invoiceId: "inv_1",
          amount: 500,
        });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
        expect(err.message).toContain("credit note remaining");
      }
    });

    it("throws error when amount exceeds invoice balance", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });

      ctx.db.invoice.findFirst
        .mockResolvedValueOnce({
          id: "cn_1",
          type: InvoiceType.CREDIT_NOTE,
          total: 1000,
          creditNoteStatus: "ISSUED",
          creditNotesIssued: [],
        })
        .mockResolvedValueOnce({
          id: "inv_1",
          total: 500,
          payments: [{ amount: 400, id: "p_1" }],
          creditNotesReceived: [],
        });

      try {
        await caller.applyToInvoice({
          creditNoteId: "cn_1",
          invoiceId: "inv_1",
          amount: 200,
        });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
        expect(err.message).toContain("invoice balance");
      }
    });

    it("throws NOT_FOUND when credit note doesn't exist", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });

      ctx.db.invoice.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "inv_1",
          total: 5000,
          payments: [],
          creditNotesReceived: [],
        });

      try {
        await caller.applyToInvoice({
          creditNoteId: "cn_nonexistent",
          invoiceId: "inv_1",
          amount: 500,
        });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });

    it("throws NOT_FOUND when invoice doesn't exist", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });

      ctx.db.invoice.findFirst
        .mockResolvedValueOnce({
          id: "cn_1",
          type: InvoiceType.CREDIT_NOTE,
          total: 1000,
          creditNotesIssued: [],
        })
        .mockResolvedValueOnce(null);

      try {
        await caller.applyToInvoice({
          creditNoteId: "cn_1",
          invoiceId: "inv_nonexistent",
          amount: 500,
        });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("validateCreditApplication", () => {
    it("validates successfully with valid amounts", () => {
      expect(() => {
        validateCreditApplication(500, 1000, 5000);
      }).not.toThrow();
    });

    it("throws error when amount exceeds credit remaining", () => {
      expect(() => {
        validateCreditApplication(1500, 1000, 5000);
      }).toThrow("Amount exceeds credit note remaining of 1000");
    });

    it("throws error when amount exceeds invoice balance", () => {
      expect(() => {
        validateCreditApplication(1500, 2000, 1000);
      }).toThrow("Amount exceeds invoice balance of 1000");
    });

    it("allows partial credit application", () => {
      expect(() => {
        validateCreditApplication(500, 1000, 5000);
      }).not.toThrow();
    });

    it("allows full credit note amount when invoice balance is larger", () => {
      expect(() => {
        validateCreditApplication(1000, 1000, 5000);
      }).not.toThrow();
    });
  });
});
