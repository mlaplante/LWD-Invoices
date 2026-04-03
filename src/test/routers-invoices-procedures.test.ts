import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoicesRouter } from "@/server/routers/invoices";
import { createMockContext } from "./mocks/trpc-context";
import { InvoiceStatus, InvoiceType, LineType } from "@/generated/prisma";
import { Decimal } from "@prisma/client-runtime-utils";

// Mock external services used by procedures
vi.mock("@/server/services/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/services/notifications", () => ({
  notifyOrgAdmins: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/services/invoice-numbering", () => ({
  generateInvoiceNumber: vi.fn().mockResolvedValue("INV-2026-0200"),
}));

vi.mock("@/server/services/email-bcc", () => ({
  getOwnerBcc: vi.fn().mockResolvedValue(null),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Map([
      ["host", "localhost:3000"],
      ["x-forwarded-proto", "http"],
    ])
  ),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ id: "email_123" }),
    },
  })),
}));

vi.mock("@react-email/render", () => ({
  render: vi.fn().mockResolvedValue("<html>mock email</html>"),
}));

vi.mock("@/emails/InvoiceSentEmail", () => ({
  InvoiceSentEmail: vi.fn().mockReturnValue("mock-email-component"),
}));

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

  describe("list", () => {
    it("returns paginated invoices", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([
        {
          id: "inv_1",
          number: "INV-2026-0001",
          status: "SENT",
          total: 1000,
          client: { id: "c1", name: "Client 1" },
          currency: { id: "usd", symbol: "$", symbolPosition: "LEFT" },
        },
      ]);
      ctx.db.invoice.count.mockResolvedValue(1);

      const result = await caller.list({
        page: 1,
        pageSize: 25,
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 25,
        })
      );
    });

    it("filters by status", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.invoice.count.mockResolvedValue(0);

      await caller.list({
        status: ["DRAFT"],
        page: 1,
        pageSize: 25,
      });

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ["DRAFT"] },
          }),
        })
      );
    });

    it("filters by date range", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.invoice.count.mockResolvedValue(0);

      const from = new Date("2026-01-01");
      const to = new Date("2026-03-31");

      await caller.list({
        dateFrom: from,
        dateTo: to,
        page: 1,
        pageSize: 25,
      });

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: {
              gte: from,
              lte: to,
            },
          }),
        })
      );
    });

    it("searches by invoice number and client name", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.invoice.count.mockResolvedValue(0);

      await caller.list({
        search: "Acme",
        page: 1,
        pageSize: 25,
      });

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { number: { contains: "Acme", mode: "insensitive" } },
              { client: { name: { contains: "Acme", mode: "insensitive" } } },
            ],
          }),
        })
      );
    });
  });

  describe("archive", () => {
    it("archives an invoice", async () => {
      ctx.db.invoice.update.mockResolvedValue({
        id: "inv_123",
        isArchived: true,
      });

      const result = await caller.archive({ id: "inv_123", isArchived: true });

      expect(result.isArchived).toBe(true);
      expect(ctx.db.invoice.update).toHaveBeenCalledWith({
        where: { id: "inv_123", organizationId: "test-org-123" },
        data: { isArchived: true },
      });
    });

    it("unarchives an invoice", async () => {
      ctx.db.invoice.update.mockResolvedValue({
        id: "inv_123",
        isArchived: false,
      });

      const result = await caller.archive({ id: "inv_123", isArchived: false });

      expect(result.isArchived).toBe(false);
      expect(ctx.db.invoice.update).toHaveBeenCalledWith({
        where: { id: "inv_123", organizationId: "test-org-123" },
        data: { isArchived: false },
      });
    });

    it("throws when invoice not found", async () => {
      ctx.db.invoice.update.mockRejectedValue(
        new Error("Record to update not found.")
      );

      await expect(
        caller.archive({ id: "inv_nonexistent", isArchived: true })
      ).rejects.toThrow();
    });
  });

  describe("markPaid (single)", () => {
    it("marks an invoice as paid with payment record", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue({
        id: "inv_123",
        status: InvoiceStatus.SENT,
      });

      // $transaction mock passes mockClient as tx, so these mock the tx calls
      ctx.db.payment.create.mockResolvedValue({
        id: "pay_123",
        amount: 1000,
        method: "manual",
        invoiceId: "inv_123",
      });

      ctx.db.invoice.update.mockResolvedValue({
        id: "inv_123",
        status: InvoiceStatus.PAID,
      });

      const result = await caller.markPaid({
        id: "inv_123",
        amount: 1000,
        method: "manual",
        paidAt: new Date("2026-03-01"),
      });

      expect(result.status).toBe(InvoiceStatus.PAID);
      expect(ctx.db.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          amount: 1000,
          method: "manual",
          invoiceId: "inv_123",
          organizationId: "test-org-123",
        }),
      });
    });

    it("throws NOT_FOUND for nonexistent invoice", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(null);

      try {
        await caller.markPaid({
          id: "inv_nonexistent",
          amount: 500,
        });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("duplicate", () => {
    it("duplicates an invoice with lines and taxes", async () => {
      const sourceInvoice = {
        id: "inv_source",
        number: "INV-2026-0100",
        type: InvoiceType.DETAILED,
        status: InvoiceStatus.SENT,
        date: new Date("2026-01-15"),
        dueDate: new Date("2026-02-15"),
        currencyId: "usd",
        exchangeRate: 1,
        simpleAmount: null,
        notes: "Test notes",
        clientId: "client_123",
        organizationId: "test-org-123",
        subtotal: 1000,
        discountTotal: 0,
        taxTotal: 100,
        total: 1100,
        lines: [
          {
            sort: 0,
            lineType: LineType.STANDARD,
            name: "Web Development",
            description: "Frontend work",
            qty: 10,
            rate: 100,
            period: null,
            discount: 0,
            discountIsPercentage: false,
            sourceTable: null,
            sourceId: null,
            subtotal: 1000,
            taxTotal: 100,
            total: 1100,
            taxes: [
              { taxId: "tax_1", taxAmount: 100 },
            ],
          },
        ],
      };

      ctx.db.invoice.findUnique.mockResolvedValue(sourceInvoice);

      const duplicatedInvoice = {
        id: "inv_dup",
        number: "INV-2026-0200",
        type: InvoiceType.DETAILED,
        status: InvoiceStatus.DRAFT,
        date: expect.any(Date),
        dueDate: new Date("2026-02-15"),
        currencyId: "usd",
        exchangeRate: 1,
        simpleAmount: null,
        notes: "Test notes",
        clientId: "client_123",
        organizationId: "test-org-123",
        subtotal: 1000,
        discountTotal: 0,
        taxTotal: 100,
        total: 1100,
        isArchived: false,
        lines: [
          {
            name: "Web Development",
            taxes: [{ taxId: "tax_1", taxAmount: 100 }],
          },
        ],
        client: { id: "client_123", name: "Test Client" },
        currency: { id: "usd", symbol: "$", symbolPosition: "LEFT" },
        payments: [],
        partialPayments: [],
        organization: { id: "test-org-123", name: "Test Org" },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ctx.db.invoice.create.mockResolvedValue(duplicatedInvoice);

      const result = await caller.duplicate({ id: "inv_source" });

      expect(result.id).toBe("inv_dup");
      expect(result.status).toBe(InvoiceStatus.DRAFT);
      expect(ctx.db.invoice.findUnique).toHaveBeenCalledWith({
        where: { id: "inv_source", organizationId: "test-org-123" },
        include: { lines: { include: { taxes: true } } },
      });
      expect(ctx.db.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            number: "INV-2026-0200",
            status: InvoiceStatus.DRAFT,
            clientId: "client_123",
          }),
        })
      );
    });

    it("throws NOT_FOUND when source invoice does not exist", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(null);

      try {
        await caller.duplicate({ id: "inv_nonexistent" });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("send", () => {
    const mockInvoice = {
      id: "inv_123",
      number: "INV-2026-0100",
      type: InvoiceType.DETAILED,
      status: InvoiceStatus.DRAFT,
      total: new Decimal("1100"),
      portalToken: "portal_abc",
      dueDate: new Date("2026-03-15"),
      organizationId: "test-org-123",
      client: {
        id: "client_123",
        name: "Test Client",
        email: "client@example.com",
      },
      organization: {
        id: "test-org-123",
        name: "Test Org",
        logoUrl: null,
      },
      currency: {
        id: "usd",
        symbol: "$",
        symbolPosition: "LEFT",
      },
      partialPayments: [],
    };

    it("sends an invoice and updates status to SENT", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.invoice.update.mockResolvedValue({
        ...mockInvoice,
        status: InvoiceStatus.SENT,
        lastSent: new Date(),
      });

      const result = await caller.send({ id: "inv_123" });

      expect(result.status).toBe(InvoiceStatus.SENT);
      expect(ctx.db.invoice.update).toHaveBeenCalledWith({
        where: { id: "inv_123", organizationId: "test-org-123" },
        data: { status: InvoiceStatus.SENT, lastSent: expect.any(Date) },
      });
    });

    it("handles client with no email gracefully", async () => {
      const invoiceNoEmail = {
        ...mockInvoice,
        client: { id: "client_123", name: "Test Client", email: null },
      };

      ctx.db.invoice.findUnique.mockResolvedValue(invoiceNoEmail);
      ctx.db.invoice.update.mockResolvedValue({
        ...invoiceNoEmail,
        status: InvoiceStatus.SENT,
        lastSent: new Date(),
      });

      // Should not throw even though client has no email
      const result = await caller.send({ id: "inv_123" });

      expect(result.status).toBe(InvoiceStatus.SENT);
      // Invoice is still updated to SENT even without email
      expect(ctx.db.invoice.update).toHaveBeenCalled();
    });

    it("throws NOT_FOUND for nonexistent invoice", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(null);

      try {
        await caller.send({ id: "inv_nonexistent" });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("markPaidMany", () => {
    it("marks multiple invoices as paid", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([
        { id: "inv_1", total: 1000, number: "INV-001" },
        { id: "inv_2", total: 2000, number: "INV-002" },
      ]);

      ctx.db.payment.create.mockResolvedValue({});
      ctx.db.invoice.update.mockResolvedValue({});

      const result = await caller.markPaidMany({
        ids: ["inv_1", "inv_2"],
        method: "manual",
        paidAt: new Date("2026-03-01"),
      });

      expect(result.paid).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it("skips invoices not in eligible status", async () => {
      // findMany returns empty because none match the status filter
      ctx.db.invoice.findMany.mockResolvedValue([]);

      const result = await caller.markPaidMany({
        ids: ["inv_draft_1", "inv_draft_2"],
        method: "manual",
      });

      expect(result.paid).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(2);
    });

    it("reports partial failures", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([
        { id: "inv_1", total: 1000, number: "INV-001" },
        { id: "inv_2", total: 2000, number: "INV-002" },
      ]);

      // First call succeeds, second fails
      let callCount = 0;
      ctx.db.payment.create.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("DB error");
        }
        return {};
      });
      ctx.db.invoice.update.mockResolvedValue({});

      const result = await caller.markPaidMany({
        ids: ["inv_1", "inv_2"],
        method: "manual",
      });

      // One succeeded, one failed
      expect(result.paid + result.failed).toBe(2);
      expect(result.errors.length).toBe(result.failed);
    });
  });
});
