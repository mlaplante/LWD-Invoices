import { describe, it, expect, beforeEach } from "vitest";
import { dashboardRouter } from "@/server/routers/dashboard";
import { createMockContext } from "./mocks/trpc-context";
import type { MockTRPCContext } from "./mocks/trpc-context";

describe("Dashboard Router", () => {
  let ctx: MockTRPCContext;
  let caller: ReturnType<typeof dashboardRouter.createCaller>;

  beforeEach(() => {
    ctx = createMockContext();
    caller = dashboardRouter.createCaller(ctx);
  });

  describe("summary", () => {
    it("returns aggregated metrics (revenue this/last month, outstanding, overdue, expenses)", async () => {
      ctx.db.payment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 8000 } }) // this month
        .mockResolvedValueOnce({ _sum: { amount: 4000 } }); // last month

      ctx.db.$queryRaw
        .mockResolvedValueOnce([{ count: 2, balance: 3500 }]) // outstanding aggregate
        .mockResolvedValueOnce([{ count: 1, balance: 1500 }]) // overdue aggregate
        .mockResolvedValueOnce([{ total: 350 }]) // this month expenses
        .mockResolvedValueOnce([{ total: 0 }]); // last month expenses

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
      expect(result.expensesChange).toBeNull(); // last month was 0
    });

    it("handles zero revenue last month (revenueChange = null)", async () => {
      ctx.db.payment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 1000 } }) // this month
        .mockResolvedValueOnce({ _sum: { amount: null } }); // last month - zero

      ctx.db.$queryRaw
        .mockResolvedValueOnce([{ count: 0, balance: 0 }]) // outstanding
        .mockResolvedValueOnce([{ count: 0, balance: 0 }]) // overdue
        .mockResolvedValueOnce([{ total: 0 }]) // this month expenses
        .mockResolvedValueOnce([{ total: 0 }]); // last month expenses

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

  describe("cashFlowInsights", () => {
    it("returns deterministic metrics and a guarded narrative payload", async () => {
      ctx.db.payment.findMany.mockResolvedValue([
        {
          amount: 1000,
          paidAt: new Date("2026-06-01"),
          invoice: {
            clientId: "c1",
            date: new Date("2026-05-01"),
            dueDate: new Date("2026-06-01"),
            client: { name: "Reliable Co" },
          },
        },
        {
          amount: 900,
          paidAt: new Date("2026-05-01"),
          invoice: {
            clientId: "c1",
            date: new Date("2026-04-01"),
            dueDate: new Date("2026-05-01"),
            client: { name: "Reliable Co" },
          },
        },
        {
          amount: 1100,
          paidAt: new Date("2026-04-01"),
          invoice: {
            clientId: "c1",
            date: new Date("2026-03-01"),
            dueDate: new Date("2026-04-01"),
            client: { name: "Reliable Co" },
          },
        },
      ]);
      ctx.db.expense.findMany.mockResolvedValue([]);
      ctx.db.invoice.findMany.mockResolvedValue([
        {
          id: "i1",
          total: 500,
          dueDate: new Date("2026-01-01"),
          status: "OVERDUE",
          payments: [],
          client: { id: "c2", name: "Late Co" },
        },
      ]);
      ctx.db.timeEntry.findMany.mockResolvedValue([
        {
          minutes: 120,
          invoiceLineId: null,
          retainerId: "r1",
          retainer: {
            name: "Support",
            clientId: "c1",
            hourlyRate: 125,
            client: { name: "Reliable Co" },
          },
        },
      ]);

      const result = await caller.cashFlowInsights();

      expect(result.metrics.overdue.total).toBe(500);
      expect(result.metrics.reliablePayers[0].clientId).toBe("c1");
      expect(result.metrics.unbilledRetainerOpportunities[0]).toEqual(
        expect.objectContaining({ hours: 2, estimatedValue: 250 }),
      );
      expect(result.narrative.summary).toContain("unbilled retainer");
    });
  });
});
