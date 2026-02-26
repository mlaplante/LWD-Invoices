import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoicesRouter } from "@/server/routers/invoices";
import { createMockContext } from "./mocks/trpc-context";
import { InvoiceStatus, InvoiceType, LineType } from "@/generated/prisma";
import { Decimal } from "@prisma/client-runtime-utils";

describe("Invoices Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = invoicesRouter.createCaller(ctx);
  });

  describe("create", () => {
    it("creates invoice with lines and taxes", async () => {
      // Mock organization lookup
      const mockOrg = {
        id: "test-org-123",
        invoicePrefix: "INV",
        invoiceNextNumber: 100,
        name: "Test Org",
        logoUrl: null,
        slug: "test-org",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.organization.findFirst.mockResolvedValue(mockOrg);
      ctx.db.organization.update.mockResolvedValue({
        ...mockOrg,
        invoiceNextNumber: 101, // Incremented after update
      });

      // Mock tax lookup
      ctx.db.tax.findMany.mockResolvedValue([
        {
          id: "tax_1",
          organizationId: "test-org-123",
          rate: new Decimal("0.1"),
          isCompound: false,
          name: "Tax 1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Mock invoice creation
      ctx.db.invoice.create.mockResolvedValue({
        id: "inv_new_123",
        number: "INV-2026-0100",
        status: InvoiceStatus.DRAFT,
        type: InvoiceType.DETAILED,
        date: new Date("2026-02-26"),
        dueDate: null,
        currencyId: "usd",
        exchangeRate: 1,
        simpleAmount: null,
        notes: null,
        clientId: "client_123",
        organizationId: "test-org-123",
        subtotal: 1000,
        discountTotal: 0,
        taxTotal: 100,
        total: 1100,
        isArchived: false,
        reminderDaysOverride: [],
        lastViewed: null,
        lastSent: null,
        portalToken: "portal_token",
        lines: [],
        client: { id: "client_123", name: "Test Client" },
        currency: { id: "usd", symbol: "$", symbolPosition: "LEFT" },
        payments: [],
        partialPayments: [],
        recurringInvoice: null,
        organization: {
          id: "test-org-123",
          invoicePrefix: "INV",
          invoiceNextNumber: 100,
          name: "Test Org",
          logoUrl: null,
          slug: "test-org",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.create({
        type: InvoiceType.DETAILED,
        date: new Date("2026-02-26"),
        currencyId: "usd",
        clientId: "client_123",
        lines: [
          {
            name: "Line 1",
            qty: 1,
            rate: 1000,
            discount: 0,
            discountIsPercentage: false,
            taxIds: ["tax_1"],
          },
        ],
      });

      expect(result.number).toBe("INV-2026-0100");
      expect(result.status).toBe(InvoiceStatus.DRAFT);
      expect(ctx.db.invoice.create).toHaveBeenCalled();
    });

    it("throws NOT_FOUND when organization doesn't exist", async () => {
      ctx.db.organization.findFirst.mockResolvedValue(null);

      try {
        await caller.create({
          type: InvoiceType.DETAILED,
          date: new Date(),
          currencyId: "usd",
          clientId: "client_123",
          lines: [],
        });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });

    it("creates invoice with multiple line items and taxes", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        invoicePrefix: "INV",
        invoiceNextNumber: 101,
        name: "Test Org",
        logoUrl: null,
        slug: "test-org",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      ctx.db.organization.update.mockResolvedValue({
        id: "test-org-123",
        invoicePrefix: "INV",
        invoiceNextNumber: 102,
        name: "Test Org",
        logoUrl: null,
        slug: "test-org",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      ctx.db.tax.findMany.mockResolvedValue([
        {
          id: "tax_1",
          organizationId: "test-org-123",
          rate: new Decimal("0.1"),
          isCompound: false,
          name: "Tax 1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "tax_2",
          organizationId: "test-org-123",
          rate: new Decimal("0.05"),
          isCompound: true,
          name: "Tax 2",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      ctx.db.invoice.create.mockResolvedValue({
        id: "inv_multi",
        number: "INV-2026-0101",
        status: InvoiceStatus.DRAFT,
        type: InvoiceType.DETAILED,
        date: new Date(),
        dueDate: null,
        currencyId: "usd",
        exchangeRate: 1,
        simpleAmount: null,
        notes: null,
        clientId: "client_123",
        organizationId: "test-org-123",
        subtotal: 2000,
        discountTotal: 100,
        taxTotal: 500,
        total: 2400,
        isArchived: false,
        reminderDaysOverride: [],
        lastViewed: null,
        lastSent: null,
        portalToken: "portal_token",
        lines: [],
        client: { id: "client_123", name: "Test Client" },
        currency: { id: "usd", symbol: "$", symbolPosition: "LEFT" },
        payments: [],
        partialPayments: [],
        recurringInvoice: null,
        organization: {
          id: "test-org-123",
          invoicePrefix: "INV",
          invoiceNextNumber: 101,
          name: "Test Org",
          logoUrl: null,
          slug: "test-org",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.create({
        type: InvoiceType.DETAILED,
        date: new Date(),
        currencyId: "usd",
        clientId: "client_123",
        lines: [
          {
            name: "Line 1",
            qty: 2,
            rate: 500,
            discount: 0,
            discountIsPercentage: false,
            taxIds: ["tax_1"],
          },
          {
            name: "Line 2",
            qty: 1,
            rate: 1000,
            discount: 100,
            discountIsPercentage: false,
            taxIds: ["tax_1", "tax_2"],
          },
        ],
      });

      expect(result.number).toBe("INV-2026-0101");
    });
  });

  describe("update", () => {
    it("updates DRAFT invoice successfully", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        invoicePrefix: "INV",
        invoiceNextNumber: 100,
        name: "Test Org",
        logoUrl: null,
        slug: "test-org",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      ctx.db.invoice.findUnique.mockResolvedValue({
        id: "inv_123",
        status: InvoiceStatus.DRAFT,
      });

      ctx.db.tax.findMany.mockResolvedValue([
        {
          id: "tax_1",
          organizationId: "test-org-123",
          rate: new Decimal("0.1"),
          isCompound: false,
          name: "Tax 1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      ctx.db.invoice.update.mockResolvedValue({
        id: "inv_123",
        number: "INV-2026-0001",
        status: InvoiceStatus.DRAFT,
        type: InvoiceType.DETAILED,
        date: new Date(),
        dueDate: null,
        currencyId: "usd",
        exchangeRate: 1,
        simpleAmount: null,
        notes: null,
        clientId: "client_updated",
        organizationId: "test-org-123",
        subtotal: 1200,
        discountTotal: 0,
        taxTotal: 120,
        total: 1320,
        isArchived: false,
        reminderDaysOverride: [],
        lastViewed: null,
        lastSent: null,
        portalToken: "portal_token",
        lines: [],
        client: { id: "client_updated", name: "Updated Client" },
        currency: { id: "usd", symbol: "$", symbolPosition: "LEFT" },
        payments: [],
        partialPayments: [],
        recurringInvoice: null,
        organization: {
          id: "test-org-123",
          invoicePrefix: "INV",
          invoiceNextNumber: 100,
          name: "Test Org",
          logoUrl: null,
          slug: "test-org",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.update({
        id: "inv_123",
        type: InvoiceType.DETAILED,
        date: new Date(),
        currencyId: "usd",
        clientId: "client_updated",
        lines: [
          {
            name: "Updated Line",
            qty: 2,
            rate: 600,
            discount: 0,
            discountIsPercentage: false,
            taxIds: ["tax_1"],
          },
        ],
      });

      expect(result.status).toBe(InvoiceStatus.DRAFT);
      expect(ctx.db.invoice.update).toHaveBeenCalled();
    });

    it("prevents updating PAID invoice", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        invoicePrefix: "INV",
        invoiceNextNumber: 100,
        name: "Test Org",
        logoUrl: null,
        slug: "test-org",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      ctx.db.invoice.findUnique.mockResolvedValue({
        id: "inv_123",
        status: InvoiceStatus.PAID,
      });

      try {
        await caller.update({
          id: "inv_123",
          type: InvoiceType.DETAILED,
          date: new Date(),
          currencyId: "usd",
          clientId: "client_123",
          lines: [],
        });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
      }
    });

    it("throws NOT_FOUND for nonexistent invoice", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
        invoicePrefix: "INV",
        invoiceNextNumber: 100,
        name: "Test Org",
        logoUrl: null,
        slug: "test-org",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      ctx.db.invoice.findUnique.mockResolvedValue(null);

      try {
        await caller.update({
          id: "inv_nonexistent",
          type: InvoiceType.DETAILED,
          date: new Date(),
          currencyId: "usd",
          clientId: "client_123",
          lines: [],
        });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("delete", () => {
    it("deletes DRAFT invoice successfully", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue({
        id: "inv_123",
        status: InvoiceStatus.DRAFT,
      });

      ctx.db.invoice.delete.mockResolvedValue({
        id: "inv_123",
        number: "INV-2026-0001",
        status: InvoiceStatus.DRAFT,
        type: InvoiceType.DETAILED,
        date: new Date(),
        dueDate: null,
        currencyId: "usd",
        exchangeRate: 1,
        simpleAmount: null,
        notes: null,
        clientId: "client_123",
        organizationId: "test-org-123",
        subtotal: 1000,
        discountTotal: 0,
        taxTotal: 100,
        total: 1100,
        isArchived: false,
        reminderDaysOverride: [],
        lastViewed: null,
        lastSent: null,
        portalToken: "portal_token",
        lines: [],
        client: { id: "client_123", name: "Test Client" },
        currency: { id: "usd", symbol: "$", symbolPosition: "LEFT" },
        payments: [],
        partialPayments: [],
        recurringInvoice: null,
        organization: {
          id: "test-org-123",
          invoicePrefix: "INV",
          invoiceNextNumber: 100,
          name: "Test Org",
          logoUrl: null,
          slug: "test-org",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.delete({ id: "inv_123" });

      expect(result.id).toBe("inv_123");
      expect(ctx.db.invoice.delete).toHaveBeenCalledWith({
        where: { id: "inv_123", organizationId: "test-org-123" },
      });
    });

    it("prevents deleting PAID invoice", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue({
        id: "inv_123",
        status: InvoiceStatus.PAID,
      });

      try {
        await caller.delete({ id: "inv_123" });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
      }
    });

    it("prevents deleting PARTIALLY_PAID invoice", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue({
        id: "inv_123",
        status: InvoiceStatus.PARTIALLY_PAID,
      });

      try {
        await caller.delete({ id: "inv_123" });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
      }
    });

    it("prevents deleting OVERDUE invoice", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue({
        id: "inv_123",
        status: InvoiceStatus.OVERDUE,
      });

      try {
        await caller.delete({ id: "inv_123" });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
      }
    });

    it("allows deleting SENT invoice", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue({
        id: "inv_123",
        status: InvoiceStatus.SENT,
      });

      ctx.db.invoice.delete.mockResolvedValue({
        id: "inv_123",
        number: "INV-2026-0001",
        status: InvoiceStatus.SENT,
        type: InvoiceType.DETAILED,
        date: new Date(),
        dueDate: null,
        currencyId: "usd",
        exchangeRate: 1,
        simpleAmount: null,
        notes: null,
        clientId: "client_123",
        organizationId: "test-org-123",
        subtotal: 1000,
        discountTotal: 0,
        taxTotal: 100,
        total: 1100,
        isArchived: false,
        reminderDaysOverride: [],
        lastViewed: null,
        lastSent: null,
        portalToken: "portal_token",
        lines: [],
        client: { id: "client_123", name: "Test Client" },
        currency: { id: "usd", symbol: "$", symbolPosition: "LEFT" },
        payments: [],
        partialPayments: [],
        recurringInvoice: null,
        organization: {
          id: "test-org-123",
          invoicePrefix: "INV",
          invoiceNextNumber: 100,
          name: "Test Org",
          logoUrl: null,
          slug: "test-org",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.delete({ id: "inv_123" });

      expect(result.id).toBe("inv_123");
      expect(ctx.db.invoice.delete).toHaveBeenCalled();
    });

    it("throws NOT_FOUND for nonexistent invoice", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(null);

      try {
        await caller.delete({ id: "inv_nonexistent" });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });
  });
});
