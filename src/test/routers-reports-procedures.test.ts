import { describe, it, expect, beforeEach, vi } from "vitest";
import { reportsRouter } from "@/server/routers/reports";
import { createMockContext } from "./mocks/trpc-context";
import { InvoiceStatus } from "@/generated/prisma";

describe("Reports Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = reportsRouter.createCaller(ctx);
  });

  describe("unpaidInvoices", () => {
    it("returns invoices with SENT, PARTIALLY_PAID, OVERDUE status", async () => {
      const mockInvoices = [
        {
          id: "inv_1",
          status: InvoiceStatus.SENT,
          isArchived: false,
          organizationId: "test-org-123",
          client: { id: "c_1", name: "Client A", email: "a@test.com" },
          currency: { code: "USD" },
        },
        {
          id: "inv_2",
          status: InvoiceStatus.PARTIALLY_PAID,
          isArchived: false,
          organizationId: "test-org-123",
          client: { id: "c_2", name: "Client B", email: "b@test.com" },
          currency: { code: "USD" },
        },
      ];

      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.invoice.findMany.mockResolvedValue(mockInvoices);

      const result = await caller.unpaidInvoices({});

      expect(result).toHaveLength(2);
      expect(result[0]?.status).toBe(InvoiceStatus.SENT);
      expect(result[1]?.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    });

    it("filters by date range when provided", async () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-01-31");

      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.unpaidInvoices({ from, to });

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

    it("throws NOT_FOUND when organization does not exist", async () => {
      ctx.db.organization.findFirst.mockResolvedValue(null);

      await expect(caller.unpaidInvoices({})).rejects.toThrow("NOT_FOUND");
    });

    it("excludes archived invoices", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.unpaidInvoices({});

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isArchived: false,
          }),
        })
      );
    });
  });

  describe("overdueInvoices", () => {
    it("returns only OVERDUE invoices", async () => {
      const mockInvoices = [
        {
          id: "inv_1",
          status: InvoiceStatus.OVERDUE,
          isArchived: false,
          organizationId: "test-org-123",
          client: { id: "c_1", name: "Client A", email: "a@test.com" },
          currency: { code: "USD" },
        },
      ];

      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.invoice.findMany.mockResolvedValue(mockInvoices);

      const result = await caller.overdueInvoices();

      expect(result).toHaveLength(1);
      expect(result[0]?.status).toBe(InvoiceStatus.OVERDUE);
    });

    it("throws NOT_FOUND when organization not found", async () => {
      ctx.db.organization.findFirst.mockResolvedValue(null);

      await expect(caller.overdueInvoices()).rejects.toThrow("NOT_FOUND");
    });

    it("excludes archived invoices", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.overdueInvoices();

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isArchived: false,
          }),
        })
      );
    });
  });

  describe("paymentsByGateway", () => {
    it("aggregates payments by gateway", async () => {
      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.payment.findMany.mockResolvedValue([
        {
          method: "stripe",
          amount: BigInt(10000),
          gatewayFee: BigInt(290),
          organizationId: "test-org-123",
        },
        {
          method: "stripe",
          amount: BigInt(20000),
          gatewayFee: BigInt(580),
          organizationId: "test-org-123",
        },
        {
          method: "paypal",
          amount: BigInt(15000),
          gatewayFee: BigInt(525),
          organizationId: "test-org-123",
        },
      ]);

      const result = await caller.paymentsByGateway({});

      expect(result.stripe).toEqual({
        count: 2,
        total: 30000,
        fees: 870,
      });
      expect(result.paypal).toEqual({
        count: 1,
        total: 15000,
        fees: 525,
      });
    });

    it("filters by date range", async () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-01-31");

      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.payment.findMany.mockResolvedValue([]);

      await caller.paymentsByGateway({ from, to });

      expect(ctx.db.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paidAt: {
              gte: from,
              lte: to,
            },
          }),
        })
      );
    });

    it("throws NOT_FOUND when organization not found", async () => {
      ctx.db.organization.findFirst.mockResolvedValue(null);

      await expect(caller.paymentsByGateway({})).rejects.toThrow("NOT_FOUND");
    });
  });

  describe("expenseBreakdown", () => {
    it("returns expenses grouped by category", async () => {
      const mockExpenses = [
        {
          id: "exp_1",
          name: "Office Supplies",
          organizationId: "test-org-123",
          category: { id: "cat_1", name: "Supplies" },
          supplier: null,
          project: null,
        },
        {
          id: "exp_2",
          name: "Software License",
          organizationId: "test-org-123",
          category: { id: "cat_2", name: "Software" },
          supplier: null,
          project: null,
        },
      ];

      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.expense.findMany.mockResolvedValue(mockExpenses);

      const result = await caller.expenseBreakdown({});

      expect(result).toHaveLength(2);
      expect(result[0]?.category.name).toBe("Supplies");
      expect(result[1]?.category.name).toBe("Software");
    });

    it("filters by date range", async () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-01-31");

      ctx.db.organization.findFirst.mockResolvedValue({
        id: "test-org-123",
      });
      ctx.db.expense.findMany.mockResolvedValue([]);

      await caller.expenseBreakdown({ from, to });

      expect(ctx.db.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: from,
              lte: to,
            },
          }),
        })
      );
    });

    it("throws NOT_FOUND when organization not found", async () => {
      ctx.db.organization.findFirst.mockResolvedValue(null);

      await expect(caller.expenseBreakdown({})).rejects.toThrow("NOT_FOUND");
    });
  });
});
