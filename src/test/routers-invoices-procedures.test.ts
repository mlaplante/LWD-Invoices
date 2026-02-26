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
  });

  describe("update", () => {
    it("placeholder test", () => {
      expect(true).toBe(true);
    });
  });

  describe("delete", () => {
    it("placeholder test", () => {
      expect(true).toBe(true);
    });
  });
});
