import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/server/services/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/services/credit-note-numbering", () => ({
  generateCreditNoteNumber: vi.fn().mockResolvedValue("CN-0001"),
  formatCreditNoteNumber: vi.fn(),
}));

import { creditNotesRouter, validateCreditApplication } from "@/server/routers/creditNotes";
import { createMockContext } from "./mocks/trpc-context";
import { InvoiceType, InvoiceStatus } from "@/generated/prisma";

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

  describe("get", () => {
    it("returns a credit note with includes", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });

      const mockCreditNote = {
        id: "cn_1",
        number: "CN-0001",
        type: InvoiceType.CREDIT_NOTE,
        organizationId: "test-org-123",
        status: "DRAFT",
        creditNoteStatus: "DRAFT",
        total: 500,
        lines: [
          {
            id: "line_1",
            sort: 0,
            name: "Service",
            qty: 1,
            rate: 500,
            taxes: [{ taxId: "tax_1", taxAmount: 50, tax: { id: "tax_1", name: "GST", rate: 10 } }],
          },
        ],
        client: { id: "c_1", name: "Test Client" },
        currency: { id: "usd", symbol: "$", code: "USD" },
        organization: { id: "test-org-123", name: "Test Org" },
        creditNotesIssued: [],
      };

      ctx.db.invoice.findFirst.mockResolvedValue(mockCreditNote);

      const result = await caller.get({ id: "cn_1" });

      expect(result.id).toBe("cn_1");
      expect(result.number).toBe("CN-0001");
      expect(result.lines).toHaveLength(1);
      expect(result.client.name).toBe("Test Client");
      expect(ctx.db.invoice.findFirst).toHaveBeenCalledWith({
        where: {
          id: "cn_1",
          organizationId: "test-org-123",
          type: InvoiceType.CREDIT_NOTE,
        },
        include: {
          lines: { include: { taxes: { include: { tax: true } } }, orderBy: { sort: "asc" } },
          client: true,
          currency: true,
          organization: true,
          creditNotesIssued: {
            include: {
              invoice: { select: { id: true, number: true, total: true } },
            },
          },
        },
      });
    });

    it("throws NOT_FOUND when credit note does not exist", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.invoice.findFirst.mockResolvedValue(null);

      try {
        await caller.get({ id: "cn_nonexistent" });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("create", () => {
    const sourceInvoice = {
      id: "inv_1",
      number: "INV-001",
      type: InvoiceType.STANDARD,
      organizationId: "test-org-123",
      clientId: "c_1",
      currencyId: "usd",
      exchangeRate: 1,
      lines: [
        {
          id: "line_1",
          sort: 0,
          lineType: "SERVICE",
          name: "Consulting",
          description: "Consulting work",
          qty: 2,
          rate: 100,
          period: null,
          discount: 0,
          discountIsPercentage: false,
          subtotal: 200,
          taxTotal: 20,
          total: 220,
          taxes: [
            {
              taxId: "tax_1",
              taxAmount: 20,
              tax: { id: "tax_1", name: "GST", rate: 10, isCompound: false },
            },
          ],
        },
        {
          id: "line_2",
          sort: 1,
          lineType: "SERVICE",
          name: "Design",
          description: "Design work",
          qty: 1,
          rate: 300,
          period: null,
          discount: 0,
          discountIsPercentage: false,
          subtotal: 300,
          taxTotal: 30,
          total: 330,
          taxes: [
            {
              taxId: "tax_1",
              taxAmount: 30,
              tax: { id: "tax_1", name: "GST", rate: 10, isCompound: false },
            },
          ],
        },
      ],
      currency: { id: "usd", symbol: "$", code: "USD" },
    };

    it("creates a credit note from source invoice with selected lines", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.invoice.findFirst.mockResolvedValue(sourceInvoice);

      const createdCreditNote = {
        id: "cn_new",
        number: "CN-0001",
        type: InvoiceType.CREDIT_NOTE,
        status: InvoiceStatus.DRAFT,
        creditNoteStatus: "DRAFT",
        sourceInvoiceId: "inv_1",
        clientId: "c_1",
        organizationId: "test-org-123",
        total: 220,
        lines: [
          { id: "cnline_1", sort: 0, name: "Consulting", qty: 2, rate: 100 },
        ],
      };

      ctx.db.invoice.create.mockResolvedValue(createdCreditNote);

      const result = await caller.create({
        sourceInvoiceId: "inv_1",
        lineIds: ["line_1"],
        notes: "Refund for consulting",
      });

      expect(result.id).toBe("cn_new");
      expect(result.number).toBe("CN-0001");
      expect(result.sourceInvoiceId).toBe("inv_1");
      expect(ctx.db.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            number: "CN-0001",
            type: InvoiceType.CREDIT_NOTE,
            status: InvoiceStatus.DRAFT,
            creditNoteStatus: "DRAFT",
            sourceInvoiceId: "inv_1",
            clientId: "c_1",
            organizationId: "test-org-123",
            currencyId: "usd",
            notes: "Refund for consulting",
          }),
        }),
      );
    });

    it("throws NOT_FOUND when source invoice does not exist", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.invoice.findFirst.mockResolvedValue(null);

      try {
        await caller.create({
          sourceInvoiceId: "inv_nonexistent",
          lineIds: ["line_1"],
        });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
        expect(err.message).toContain("Source invoice not found");
      }
    });

    it("throws BAD_REQUEST when source is a credit note", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.invoice.findFirst.mockResolvedValue({
        ...sourceInvoice,
        type: InvoiceType.CREDIT_NOTE,
      });

      try {
        await caller.create({
          sourceInvoiceId: "inv_1",
          lineIds: ["line_1"],
        });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
        expect(err.message).toContain("Cannot create credit note from a credit note");
      }
    });

    it("throws BAD_REQUEST when no valid lines selected", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.invoice.findFirst.mockResolvedValue(sourceInvoice);

      try {
        await caller.create({
          sourceInvoiceId: "inv_1",
          lineIds: ["nonexistent_line"],
        });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
        expect(err.message).toContain("No valid lines selected");
      }
    });
  });

  describe("issue", () => {
    it("issues a DRAFT credit note successfully", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.invoice.findFirst.mockResolvedValue({
        id: "cn_1",
        number: "CN-0001",
        type: InvoiceType.CREDIT_NOTE,
        creditNoteStatus: "DRAFT",
        organizationId: "test-org-123",
      });

      const updatedCn = {
        id: "cn_1",
        number: "CN-0001",
        creditNoteStatus: "ISSUED",
        status: InvoiceStatus.SENT,
      };
      ctx.db.invoice.update.mockResolvedValue(updatedCn);

      const result = await caller.issue({ id: "cn_1" });

      expect(result.creditNoteStatus).toBe("ISSUED");
      expect(ctx.db.invoice.update).toHaveBeenCalledWith({
        where: { id: "cn_1" },
        data: {
          creditNoteStatus: "ISSUED",
          status: InvoiceStatus.SENT,
        },
      });
    });

    it("throws NOT_FOUND when credit note does not exist", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.invoice.findFirst.mockResolvedValue(null);

      try {
        await caller.issue({ id: "cn_nonexistent" });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });

    it("throws BAD_REQUEST when credit note is already ISSUED", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.invoice.findFirst.mockResolvedValue({
        id: "cn_1",
        number: "CN-0001",
        type: InvoiceType.CREDIT_NOTE,
        creditNoteStatus: "ISSUED",
        organizationId: "test-org-123",
      });

      try {
        await caller.issue({ id: "cn_1" });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
        expect(err.message).toContain("Cannot issue a credit note with status ISSUED");
      }
    });

    it("throws BAD_REQUEST when credit note is VOIDED", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.invoice.findFirst.mockResolvedValue({
        id: "cn_1",
        number: "CN-0001",
        type: InvoiceType.CREDIT_NOTE,
        creditNoteStatus: "VOIDED",
        organizationId: "test-org-123",
      });

      try {
        await caller.issue({ id: "cn_1" });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
        expect(err.message).toContain("Cannot issue a credit note with status VOIDED");
      }
    });
  });

  describe("void", () => {
    it("voids a DRAFT credit note successfully", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.invoice.findFirst.mockResolvedValue({
        id: "cn_1",
        number: "CN-0001",
        type: InvoiceType.CREDIT_NOTE,
        creditNoteStatus: "DRAFT",
        organizationId: "test-org-123",
        creditNotesIssued: [],
      });

      const updatedCn = {
        id: "cn_1",
        number: "CN-0001",
        creditNoteStatus: "VOIDED",
      };
      ctx.db.invoice.update.mockResolvedValue(updatedCn);

      const result = await caller.void({ id: "cn_1" });

      expect(result.creditNoteStatus).toBe("VOIDED");
      expect(ctx.db.invoice.update).toHaveBeenCalledWith({
        where: { id: "cn_1" },
        data: { creditNoteStatus: "VOIDED" },
      });
    });

    it("voids an ISSUED credit note with no applications", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.invoice.findFirst.mockResolvedValue({
        id: "cn_1",
        number: "CN-0001",
        type: InvoiceType.CREDIT_NOTE,
        creditNoteStatus: "ISSUED",
        organizationId: "test-org-123",
        creditNotesIssued: [],
      });

      ctx.db.invoice.update.mockResolvedValue({
        id: "cn_1",
        creditNoteStatus: "VOIDED",
      });

      const result = await caller.void({ id: "cn_1" });
      expect(result.creditNoteStatus).toBe("VOIDED");
    });

    it("throws NOT_FOUND when credit note does not exist", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.invoice.findFirst.mockResolvedValue(null);

      try {
        await caller.void({ id: "cn_nonexistent" });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });

    it("throws BAD_REQUEST when credit note is APPLIED", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.invoice.findFirst.mockResolvedValue({
        id: "cn_1",
        number: "CN-0001",
        type: InvoiceType.CREDIT_NOTE,
        creditNoteStatus: "APPLIED",
        organizationId: "test-org-123",
        creditNotesIssued: [],
      });

      try {
        await caller.void({ id: "cn_1" });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
        expect(err.message).toContain("Cannot void a credit note that has been applied");
      }
    });

    it("throws BAD_REQUEST when credit note is already VOIDED", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.invoice.findFirst.mockResolvedValue({
        id: "cn_1",
        number: "CN-0001",
        type: InvoiceType.CREDIT_NOTE,
        creditNoteStatus: "VOIDED",
        organizationId: "test-org-123",
        creditNotesIssued: [],
      });

      try {
        await caller.void({ id: "cn_1" });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
        expect(err.message).toContain("Credit note is already voided");
      }
    });

    it("throws BAD_REQUEST when credit note has existing applications", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
      ctx.db.invoice.findFirst.mockResolvedValue({
        id: "cn_1",
        number: "CN-0001",
        type: InvoiceType.CREDIT_NOTE,
        creditNoteStatus: "ISSUED",
        organizationId: "test-org-123",
        creditNotesIssued: [
          { id: "cna_1", amount: 200, creditNoteId: "cn_1", invoiceId: "inv_1" },
        ],
      });

      try {
        await caller.void({ id: "cn_1" });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
        expect(err.message).toContain("Cannot void a credit note with existing applications");
      }
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
