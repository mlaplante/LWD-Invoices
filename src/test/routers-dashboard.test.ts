import { describe, it, expect, beforeEach } from "vitest";
import { dashboardRouter } from "@/server/routers/dashboard";
import { createMockContext } from "./mocks/trpc-context";

describe("Dashboard Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = dashboardRouter.createCaller(ctx);
  });

  describe("summary", () => {
    it("returns aggregated metrics (revenue this/last month, outstanding, overdue, expenses)", async () => {
      ctx.db.payment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 8000 } }) // this month
        .mockResolvedValueOnce({ _sum: { amount: 4000 } }); // last month

      ctx.db.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { total: 3500 }, _count: 2 }) // outstanding
        .mockResolvedValueOnce({ _sum: { total: 1500 }, _count: 1 }); // overdue

      ctx.db.expense.findMany.mockResolvedValue([
        { rate: 100, qty: 2 },
        { rate: 50, qty: 3 },
      ]);

      const result = await caller.summary({});

      expect(result.revenueThisMonth).toBe(8000);
      expect(result.revenueLastMonth).toBe(4000);
      expect(result.revenueChange).toBe(100); // 100% increase
      expect(result.outstandingCount).toBe(2);
      expect(result.outstandingTotal).toBe(3500);
      expect(result.overdueCount).toBe(1);
      expect(result.overdueTotal).toBe(1500);
      expect(result.cashCollected).toBe(8000);
      expect(result.expensesThisMonth).toBe(350);
    });

    it("handles zero revenue last month (revenueChange = null)", async () => {
      ctx.db.payment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 1000 } }) // this month
        .mockResolvedValueOnce({ _sum: { amount: null } }); // last month - zero

      ctx.db.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { total: null }, _count: 0 }) // outstanding
        .mockResolvedValueOnce({ _sum: { total: null }, _count: 0 }); // overdue

      ctx.db.expense.findMany.mockResolvedValue([]);

      const result = await caller.summary({});

      expect(result.revenueThisMonth).toBe(1000);
      expect(result.revenueLastMonth).toBe(0);
      expect(result.revenueChange).toBeNull();
    });
  });

  describe("revenueChart", () => {
    it("returns 12 months of data", async () => {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      ctx.db.$queryRaw.mockResolvedValue([
        { month: currentMonth, total: 5000 },
      ]);

      const result = await caller.revenueChart();

      expect(result).toHaveLength(12);
      expect(result[0]).toHaveProperty("month");
      expect(result[0]).toHaveProperty("revenue");
      // Last element should have the current month's revenue
      expect(result[11].revenue).toBe(5000);
    });
  });

  describe("invoiceStatusBreakdown", () => {
    it("groups by status", async () => {
      ctx.db.invoice.groupBy.mockResolvedValue([
        { status: "DRAFT", _count: 2 },
        { status: "SENT", _count: 1 },
        { status: "PAID", _count: 3 },
        { status: "OVERDUE", _count: 1 },
      ]);

      const result = await caller.invoiceStatusBreakdown();

      expect(result).toEqual(
        expect.arrayContaining([
          { status: "DRAFT", count: 2 },
          { status: "SENT", count: 1 },
          { status: "PAID", count: 3 },
          { status: "OVERDUE", count: 1 },
        ])
      );
    });
  });

  describe("expensesVsRevenue", () => {
    it("returns 6 months of data", async () => {
      ctx.db.$queryRaw.mockResolvedValue([]);

      const result = await caller.expensesVsRevenue();

      expect(result).toHaveLength(6);
      expect(result[0]).toHaveProperty("month");
      expect(result[0]).toHaveProperty("revenue");
      expect(result[0]).toHaveProperty("expenses");
    });
  });
});
