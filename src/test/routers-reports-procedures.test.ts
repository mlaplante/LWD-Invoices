import { describe, it, expect, beforeEach, vi } from "vitest";
import { reportsRouter, groupByMonth } from "@/server/routers/reports";
import { createMockContext } from "./mocks/trpc-context";
import { InvoiceStatus, InvoiceType } from "@/generated/prisma";

describe("Reports Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = reportsRouter.createCaller(ctx);
  });

  // ──────────────────────────────────────────────────────────
  // groupByMonth helper
  // ──────────────────────────────────────────────────────────
  describe("groupByMonth", () => {
    it("groups items by year-month key", () => {
      const items = [
        { d: new Date("2026-01-15"), v: 100 },
        { d: new Date("2026-01-20"), v: 200 },
        { d: new Date("2026-02-10"), v: 50 },
      ];
      const result = groupByMonth(items, (i) => i.d, (i) => i.v);
      expect(result).toEqual({ "2026-01": 300, "2026-02": 50 });
    });

    it("returns empty object for empty array", () => {
      expect(groupByMonth([], () => new Date(), () => 0)).toEqual({});
    });

    it("pads month to two digits", () => {
      const items = [{ d: new Date("2026-03-01"), v: 10 }];
      const result = groupByMonth(items, (i) => i.d, (i) => i.v);
      expect(result).toEqual({ "2026-03": 10 });
    });
  });

  // ──────────────────────────────────────────────────────────
  // unpaidInvoices
  // ──────────────────────────────────────────────────────────
  describe("unpaidInvoices", () => {
    it("returns invoices with SENT, PARTIALLY_PAID, OVERDUE status", async () => {
      const mockInvoices = [
        {
          id: "inv_1",
          status: InvoiceStatus.SENT,
          isArchived: false,
          organizationId: "test-org-123",
          client: { id: "c_1", name: "Client A" },
          currency: { id: "cur_1", code: "USD", symbol: "$", symbolPosition: "before" },
        },
        {
          id: "inv_2",
          status: InvoiceStatus.PARTIALLY_PAID,
          isArchived: false,
          organizationId: "test-org-123",
          client: { id: "c_2", name: "Client B" },
          currency: { id: "cur_1", code: "USD", symbol: "$", symbolPosition: "before" },
        },
      ];

      ctx.db.invoice.findMany.mockResolvedValue(mockInvoices);

      const result = await caller.unpaidInvoices({});

      expect(result).toHaveLength(2);
      expect(result[0]?.status).toBe(InvoiceStatus.SENT);
      expect(result[1]?.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    });

    it("filters by date range when provided", async () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-01-31");

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

    it("excludes archived invoices", async () => {
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

    it("includes client and currency relations", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.unpaidInvoices({});

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            client: { select: { id: true, name: true } },
            currency: { select: { id: true, code: true, symbol: true, symbolPosition: true } },
          }),
        })
      );
    });

    it("orders by dueDate ascending", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.unpaidInvoices({});

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { dueDate: "asc" },
        })
      );
    });

    it("does not add date filter when no dates provided", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.unpaidInvoices({});

      const callArgs = ctx.db.invoice.findMany.mock.calls[0][0];
      expect(callArgs.where.date).toBeUndefined();
    });

    it("filters with only from date", async () => {
      const from = new Date("2026-01-01");
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.unpaidInvoices({ from });

      const callArgs = ctx.db.invoice.findMany.mock.calls[0][0];
      expect(callArgs.where.date).toEqual({ gte: from });
    });

    it("filters with only to date", async () => {
      const to = new Date("2026-01-31");
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.unpaidInvoices({ to });

      const callArgs = ctx.db.invoice.findMany.mock.calls[0][0];
      expect(callArgs.where.date).toEqual({ lte: to });
    });
  });

  // ──────────────────────────────────────────────────────────
  // overdueInvoices
  // ──────────────────────────────────────────────────────────
  describe("overdueInvoices", () => {
    it("returns only OVERDUE invoices", async () => {
      const mockInvoices = [
        {
          id: "inv_1",
          status: InvoiceStatus.OVERDUE,
          isArchived: false,
          organizationId: "test-org-123",
          client: { id: "c_1", name: "Client A" },
          currency: { id: "cur_1", code: "USD", symbol: "$", symbolPosition: "before" },
        },
      ];

      ctx.db.invoice.findMany.mockResolvedValue(mockInvoices);

      const result = await caller.overdueInvoices();

      expect(result).toHaveLength(1);
      expect(result[0]?.status).toBe(InvoiceStatus.OVERDUE);
    });

    it("excludes archived invoices", async () => {
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

    it("filters by organizationId", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.overdueInvoices();

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
          }),
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  // paymentsByGateway
  // ──────────────────────────────────────────────────────────
  describe("paymentsByGateway", () => {
    it("aggregates payments by gateway using groupBy", async () => {
      ctx.db.payment.groupBy.mockResolvedValue([
        {
          method: "stripe",
          _count: 2,
          _sum: { amount: BigInt(30000), gatewayFee: BigInt(870) },
        },
        {
          method: "paypal",
          _count: 1,
          _sum: { amount: BigInt(15000), gatewayFee: BigInt(525) },
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

      ctx.db.payment.groupBy.mockResolvedValue([]);

      await caller.paymentsByGateway({ from, to });

      expect(ctx.db.payment.groupBy).toHaveBeenCalledWith(
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

    it("returns empty object when no payments", async () => {
      ctx.db.payment.groupBy.mockResolvedValue([]);

      const result = await caller.paymentsByGateway({});

      expect(result).toEqual({});
    });

    it("handles null amount and gatewayFee gracefully", async () => {
      ctx.db.payment.groupBy.mockResolvedValue([
        {
          method: "manual",
          _count: 3,
          _sum: { amount: null, gatewayFee: null },
        },
      ]);

      const result = await caller.paymentsByGateway({});

      expect(result.manual).toEqual({
        count: 3,
        total: 0,
        fees: 0,
      });
    });
  });

  // ──────────────────────────────────────────────────────────
  // expenseBreakdown
  // ──────────────────────────────────────────────────────────
  describe("expenseBreakdown", () => {
    it("returns expenses with relations", async () => {
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

      ctx.db.expense.findMany.mockResolvedValue(mockExpenses);

      const result = await caller.expenseBreakdown({});

      expect(result).toHaveLength(2);
      expect(result[0]?.category.name).toBe("Supplies");
      expect(result[1]?.category.name).toBe("Software");
    });

    it("filters by date range", async () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-01-31");

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

    it("filters by categoryId when provided", async () => {
      ctx.db.expense.findMany.mockResolvedValue([]);

      await caller.expenseBreakdown({ categoryId: "cat_1" });

      expect(ctx.db.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryId: "cat_1",
          }),
        })
      );
    });

    it("does not include categoryId filter when not provided", async () => {
      ctx.db.expense.findMany.mockResolvedValue([]);

      await caller.expenseBreakdown({});

      const callArgs = ctx.db.expense.findMany.mock.calls[0][0];
      expect(callArgs.where.categoryId).toBeUndefined();
    });

    it("orders by createdAt descending", async () => {
      ctx.db.expense.findMany.mockResolvedValue([]);

      await caller.expenseBreakdown({});

      expect(ctx.db.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: "desc" },
        })
      );
    });

    it("includes category, supplier, and project relations", async () => {
      ctx.db.expense.findMany.mockResolvedValue([]);

      await caller.expenseBreakdown({});

      expect(ctx.db.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            category: true,
            supplier: true,
            project: { select: { id: true, name: true } },
          },
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  // cashFlowSummary
  // ──────────────────────────────────────────────────────────
  describe("cashFlowSummary", () => {
    it("returns this month and last month totals", async () => {
      ctx.db.payment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 5000 } })
        .mockResolvedValueOnce({ _sum: { amount: 3000 } });

      const result = await caller.cashFlowSummary();

      expect(result).toEqual({
        thisMonth: 5000,
        lastMonth: 3000,
      });
    });

    it("handles null amounts as zero", async () => {
      ctx.db.payment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } });

      const result = await caller.cashFlowSummary();

      expect(result).toEqual({
        thisMonth: 0,
        lastMonth: 0,
      });
    });

    it("calls aggregate twice with correct org filter", async () => {
      ctx.db.payment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 100 } })
        .mockResolvedValueOnce({ _sum: { amount: 200 } });

      await caller.cashFlowSummary();

      expect(ctx.db.payment.aggregate).toHaveBeenCalledTimes(2);
      // Both calls filter by organizationId
      for (const call of ctx.db.payment.aggregate.mock.calls) {
        expect(call[0].where.organizationId).toBe("test-org-123");
      }
    });

    it("converts BigInt amounts to numbers", async () => {
      ctx.db.payment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: BigInt(5000) } })
        .mockResolvedValueOnce({ _sum: { amount: BigInt(3000) } });

      const result = await caller.cashFlowSummary();

      expect(result.thisMonth).toBe(5000);
      expect(result.lastMonth).toBe(3000);
      expect(typeof result.thisMonth).toBe("number");
    });
  });

  // ──────────────────────────────────────────────────────────
  // upcomingDue
  // ──────────────────────────────────────────────────────────
  describe("upcomingDue", () => {
    it("returns invoices due within 7 days", async () => {
      const tomorrow = new Date(Date.now() + 86400000);
      const mockInvoices = [
        {
          id: "inv_1",
          status: InvoiceStatus.SENT,
          dueDate: tomorrow,
          client: { name: "Client A" },
          currency: { id: "cur_1", code: "USD", symbol: "$", symbolPosition: "before" },
        },
      ];

      ctx.db.invoice.findMany.mockResolvedValue(mockInvoices);

      const result = await caller.upcomingDue();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("inv_1");
    });

    it("filters for SENT and PARTIALLY_PAID statuses only", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.upcomingDue();

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
          }),
        })
      );
    });

    it("excludes archived invoices", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.upcomingDue();

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isArchived: false,
          }),
        })
      );
    });

    it("uses dueDate range from now to 7 days ahead", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      const before = Date.now();
      await caller.upcomingDue();
      const after = Date.now();

      const callArgs = ctx.db.invoice.findMany.mock.calls[0][0];
      const gte = callArgs.where.dueDate.gte.getTime();
      const lte = callArgs.where.dueDate.lte.getTime();

      // gte should be roughly "now"
      expect(gte).toBeGreaterThanOrEqual(before);
      expect(gte).toBeLessThanOrEqual(after);

      // lte should be roughly now + 7 days
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      expect(lte).toBeGreaterThanOrEqual(before + sevenDays);
      expect(lte).toBeLessThanOrEqual(after + sevenDays);
    });
  });

  // ──────────────────────────────────────────────────────────
  // revenueByMonth
  // ──────────────────────────────────────────────────────────
  describe("revenueByMonth", () => {
    it("returns monthly revenue from raw query", async () => {
      ctx.db.$queryRaw.mockResolvedValue([
        { month: "2026-01", total: 5000 },
        { month: "2026-02", total: 7500 },
      ]);

      const result = await caller.revenueByMonth({});

      expect(result).toEqual({
        "2026-01": 5000,
        "2026-02": 7500,
      });
    });

    it("returns empty object when no payments", async () => {
      ctx.db.$queryRaw.mockResolvedValue([]);

      const result = await caller.revenueByMonth({});

      expect(result).toEqual({});
    });

    it("calls $queryRaw", async () => {
      ctx.db.$queryRaw.mockResolvedValue([]);

      await caller.revenueByMonth({});

      expect(ctx.db.$queryRaw).toHaveBeenCalled();
    });

    it("handles single month result", async () => {
      ctx.db.$queryRaw.mockResolvedValue([
        { month: "2026-03", total: 12000 },
      ]);

      const result = await caller.revenueByMonth({});

      expect(Object.keys(result)).toHaveLength(1);
      expect(result["2026-03"]).toBe(12000);
    });
  });

  // ──────────────────────────────────────────────────────────
  // profitLoss
  // ──────────────────────────────────────────────────────────
  describe("profitLoss", () => {
    it("calculates net income from payments minus expenses minus credits", async () => {
      ctx.db.payment.findMany.mockResolvedValue([
        { amount: 1000, paidAt: new Date("2026-01-15") },
        { amount: 2000, paidAt: new Date("2026-01-20") },
      ]);
      ctx.db.expense.findMany.mockResolvedValue([
        { rate: 100, qty: 2, createdAt: new Date("2026-01-10") },
      ]);
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([]);

      const result = await caller.profitLoss({});

      expect(result.totalRevenue).toBe(3000);
      expect(result.totalExpenses).toBe(200);
      expect(result.totalCredits).toBe(0);
      expect(result.netIncome).toBe(2800);
    });

    it("groups revenue, expenses, and credits by month", async () => {
      ctx.db.payment.findMany.mockResolvedValue([
        { amount: 1000, paidAt: new Date("2026-01-15") },
        { amount: 500, paidAt: new Date("2026-02-10") },
      ]);
      ctx.db.expense.findMany.mockResolvedValue([
        { rate: 50, qty: 1, createdAt: new Date("2026-01-05") },
        { rate: 100, qty: 1, createdAt: new Date("2026-02-15") },
      ]);
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([
        { amount: 200, createdAt: new Date("2026-01-20") },
      ]);

      const result = await caller.profitLoss({});

      expect(result.revenueByMonth).toEqual({ "2026-01": 1000, "2026-02": 500 });
      expect(result.expensesByMonth).toEqual({ "2026-01": 50, "2026-02": 100 });
      expect(result.creditsByMonth).toEqual({ "2026-01": 200 });
      expect(result.netByMonth["2026-01"]).toBe(1000 - 50 - 200);
      expect(result.netByMonth["2026-02"]).toBe(500 - 100);
    });

    it("calculates percentage-based discounts", async () => {
      ctx.db.payment.findMany.mockResolvedValue([]);
      ctx.db.expense.findMany.mockResolvedValue([]);
      ctx.db.invoice.findMany.mockResolvedValue([
        { discountType: "percentage", discountAmount: 10, subtotal: 1000 },
      ]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([]);

      const result = await caller.profitLoss({});

      expect(result.totalDiscountsGiven).toBe(100);
    });

    it("calculates flat amount discounts", async () => {
      ctx.db.payment.findMany.mockResolvedValue([]);
      ctx.db.expense.findMany.mockResolvedValue([]);
      ctx.db.invoice.findMany.mockResolvedValue([
        { discountType: "flat", discountAmount: 50, subtotal: 1000 },
      ]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([]);

      const result = await caller.profitLoss({});

      expect(result.totalDiscountsGiven).toBe(50);
    });

    it("combines multiple discounts", async () => {
      ctx.db.payment.findMany.mockResolvedValue([]);
      ctx.db.expense.findMany.mockResolvedValue([]);
      ctx.db.invoice.findMany.mockResolvedValue([
        { discountType: "percentage", discountAmount: 10, subtotal: 1000 }, // 100
        { discountType: "flat", discountAmount: 25, subtotal: 500 },        // 25
      ]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([]);

      const result = await caller.profitLoss({});

      expect(result.totalDiscountsGiven).toBe(125);
    });

    it("rounds discounts to 2 decimal places", async () => {
      ctx.db.payment.findMany.mockResolvedValue([]);
      ctx.db.expense.findMany.mockResolvedValue([]);
      ctx.db.invoice.findMany.mockResolvedValue([
        { discountType: "percentage", discountAmount: 33.33, subtotal: 100 },
      ]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([]);

      const result = await caller.profitLoss({});

      expect(result.totalDiscountsGiven).toBe(33.33);
    });

    it("returns all expected fields", async () => {
      ctx.db.payment.findMany.mockResolvedValue([]);
      ctx.db.expense.findMany.mockResolvedValue([]);
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([]);

      const result = await caller.profitLoss({});

      expect(result).toHaveProperty("revenueByMonth");
      expect(result).toHaveProperty("expensesByMonth");
      expect(result).toHaveProperty("creditsByMonth");
      expect(result).toHaveProperty("netByMonth");
      expect(result).toHaveProperty("totalRevenue");
      expect(result).toHaveProperty("totalExpenses");
      expect(result).toHaveProperty("totalCredits");
      expect(result).toHaveProperty("netIncome");
      expect(result).toHaveProperty("totalDiscountsGiven");
    });

    it("handles empty data with zeroes", async () => {
      ctx.db.payment.findMany.mockResolvedValue([]);
      ctx.db.expense.findMany.mockResolvedValue([]);
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([]);

      const result = await caller.profitLoss({});

      expect(result.totalRevenue).toBe(0);
      expect(result.totalExpenses).toBe(0);
      expect(result.totalCredits).toBe(0);
      expect(result.netIncome).toBe(0);
      expect(result.totalDiscountsGiven).toBe(0);
      expect(result.netByMonth).toEqual({});
    });

    it("filters payments by date range", async () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-01-31");

      ctx.db.payment.findMany.mockResolvedValue([]);
      ctx.db.expense.findMany.mockResolvedValue([]);
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([]);

      await caller.profitLoss({ from, to });

      expect(ctx.db.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paidAt: { gte: from, lte: to },
          }),
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  // invoiceAging
  // ──────────────────────────────────────────────────────────
  describe("invoiceAging", () => {
    const now = Date.now();

    function makeInvoice(id: string, dueDate: Date) {
      return {
        id,
        status: InvoiceStatus.OVERDUE,
        isArchived: false,
        total: 1000,
        dueDate,
        client: { name: "Client" },
        currency: { id: "cur_1", code: "USD", symbol: "$", symbolPosition: "before" },
      };
    }

    it("puts not-yet-due invoices in current bucket", async () => {
      const future = new Date(now + 5 * 86400000);
      ctx.db.invoice.findMany.mockResolvedValue([makeInvoice("inv_1", future)]);

      const result = await caller.invoiceAging();

      expect(result.current).toHaveLength(1);
      expect(result.days1_30).toHaveLength(0);
    });

    it("puts 1-30 day overdue invoices in days1_30 bucket", async () => {
      const past15 = new Date(now - 15 * 86400000);
      ctx.db.invoice.findMany.mockResolvedValue([makeInvoice("inv_1", past15)]);

      const result = await caller.invoiceAging();

      expect(result.days1_30).toHaveLength(1);
      expect(result.days1_30[0].daysOverdue).toBeGreaterThanOrEqual(14);
      expect(result.days1_30[0].daysOverdue).toBeLessThanOrEqual(16);
    });

    it("puts 31-60 day overdue invoices in days31_60 bucket", async () => {
      const past45 = new Date(now - 45 * 86400000);
      ctx.db.invoice.findMany.mockResolvedValue([makeInvoice("inv_1", past45)]);

      const result = await caller.invoiceAging();

      expect(result.days31_60).toHaveLength(1);
    });

    it("puts 61-90 day overdue invoices in days61_90 bucket", async () => {
      const past75 = new Date(now - 75 * 86400000);
      ctx.db.invoice.findMany.mockResolvedValue([makeInvoice("inv_1", past75)]);

      const result = await caller.invoiceAging();

      expect(result.days61_90).toHaveLength(1);
    });

    it("puts 90+ day overdue invoices in days90plus bucket", async () => {
      const past120 = new Date(now - 120 * 86400000);
      ctx.db.invoice.findMany.mockResolvedValue([makeInvoice("inv_1", past120)]);

      const result = await caller.invoiceAging();

      expect(result.days90plus).toHaveLength(1);
    });

    it("distributes multiple invoices across buckets", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([
        makeInvoice("inv_1", new Date(now + 86400000)),    // current
        makeInvoice("inv_2", new Date(now - 10 * 86400000)), // 1-30
        makeInvoice("inv_3", new Date(now - 50 * 86400000)), // 31-60
        makeInvoice("inv_4", new Date(now - 80 * 86400000)), // 61-90
        makeInvoice("inv_5", new Date(now - 100 * 86400000)), // 90+
      ]);

      const result = await caller.invoiceAging();

      expect(result.current).toHaveLength(1);
      expect(result.days1_30).toHaveLength(1);
      expect(result.days31_60).toHaveLength(1);
      expect(result.days61_90).toHaveLength(1);
      expect(result.days90plus).toHaveLength(1);
    });

    it("returns empty buckets when no invoices", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      const result = await caller.invoiceAging();

      expect(result.current).toHaveLength(0);
      expect(result.days1_30).toHaveLength(0);
      expect(result.days31_60).toHaveLength(0);
      expect(result.days61_90).toHaveLength(0);
      expect(result.days90plus).toHaveLength(0);
    });

    it("handles invoice with null dueDate (treated as 0 days overdue = current)", async () => {
      const inv = {
        ...makeInvoice("inv_1", new Date()),
        dueDate: null,
      };
      ctx.db.invoice.findMany.mockResolvedValue([inv]);

      const result = await caller.invoiceAging();

      expect(result.current).toHaveLength(1);
      expect(result.current[0].daysOverdue).toBe(0);
    });

    it("enriches invoices with daysOverdue field", async () => {
      const past10 = new Date(now - 10 * 86400000);
      ctx.db.invoice.findMany.mockResolvedValue([makeInvoice("inv_1", past10)]);

      const result = await caller.invoiceAging();

      expect(result.days1_30[0]).toHaveProperty("daysOverdue");
      expect(typeof result.days1_30[0].daysOverdue).toBe("number");
    });
  });

  // ──────────────────────────────────────────────────────────
  // timeTracking
  // ──────────────────────────────────────────────────────────
  describe("timeTracking", () => {
    it("aggregates time entries by project", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([
        {
          id: "te_1",
          projectId: "proj_1",
          minutes: 60,
          project: { id: "proj_1", name: "Website", rate: 100, client: { name: "Client A" } },
        },
        {
          id: "te_2",
          projectId: "proj_1",
          minutes: 120,
          project: { id: "proj_1", name: "Website", rate: 100, client: { name: "Client A" } },
        },
        {
          id: "te_3",
          projectId: "proj_2",
          minutes: 30,
          project: { id: "proj_2", name: "Mobile App", rate: 150, client: { name: "Client B" } },
        },
      ]);

      const result = await caller.timeTracking({});

      expect(result).toHaveLength(2);
      // Sorted by totalMinutes descending
      expect(result[0].projectName).toBe("Website");
      expect(result[0].totalMinutes).toBe(180);
      expect(result[0].billableAmount).toBe((180 / 60) * 100); // 300
      expect(result[1].projectName).toBe("Mobile App");
      expect(result[1].totalMinutes).toBe(30);
      expect(result[1].billableAmount).toBe((30 / 60) * 150); // 75
    });

    it("returns empty array when no entries", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      const result = await caller.timeTracking({});

      expect(result).toEqual([]);
    });

    it("filters by date range", async () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-01-31");

      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      await caller.timeTracking({ from, to });

      expect(ctx.db.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: { gte: from, lte: to },
          }),
        })
      );
    });

    it("includes project with client relation", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      await caller.timeTracking({});

      expect(ctx.db.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            project: {
              select: {
                id: true,
                name: true,
                rate: true,
                client: { select: { name: true } },
              },
            },
          },
        })
      );
    });

    it("sorts results by totalMinutes descending", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([
        {
          id: "te_1",
          projectId: "proj_1",
          minutes: 30,
          project: { id: "proj_1", name: "Small", rate: 50, client: { name: "C" } },
        },
        {
          id: "te_2",
          projectId: "proj_2",
          minutes: 120,
          project: { id: "proj_2", name: "Large", rate: 100, client: { name: "C" } },
        },
      ]);

      const result = await caller.timeTracking({});

      expect(result[0].projectName).toBe("Large");
      expect(result[1].projectName).toBe("Small");
    });

    it("returns correct shape per project", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([
        {
          id: "te_1",
          projectId: "proj_1",
          minutes: 90,
          project: { id: "proj_1", name: "Website", rate: 120, client: { name: "Acme" } },
        },
      ]);

      const result = await caller.timeTracking({});

      expect(result[0]).toEqual({
        projectId: "proj_1",
        projectName: "Website",
        clientName: "Acme",
        totalMinutes: 90,
        billableAmount: (90 / 60) * 120,
      });
    });
  });

  // ──────────────────────────────────────────────────────────
  // taxLiability (accrual basis)
  // ──────────────────────────────────────────────────────────
  describe("taxLiability - accrual basis", () => {
    it("returns summary and details from invoiceLineTax data", async () => {
      const mockLineTaxes = [
        {
          taxId: "tax_1",
          taxAmount: 100,
          tax: { name: "GST", rate: 10 },
          invoiceLine: {
            invoice: {
              id: "inv_1",
              number: "INV-001",
              date: new Date("2026-01-15"),
              total: 1100,
              status: InvoiceStatus.PAID,
              client: { name: "Client A" },
              payments: [{ amount: 1100, paidAt: new Date("2026-01-20") }],
            },
          },
        },
        {
          taxId: "tax_1",
          taxAmount: 50,
          tax: { name: "GST", rate: 10 },
          invoiceLine: {
            invoice: {
              id: "inv_2",
              number: "INV-002",
              date: new Date("2026-02-10"),
              total: 550,
              status: InvoiceStatus.SENT,
              client: { name: "Client B" },
              payments: [],
            },
          },
        },
      ];

      ctx.db.invoiceLineTax.findMany.mockResolvedValue(mockLineTaxes);

      const result = await caller.taxLiability({ basis: "accrual" });

      expect(result.grandTotal).toBe(150);
      expect(result.summary).toHaveLength(1);
      expect(result.summary[0].taxName).toBe("GST");
      expect(result.summary[0].totalCollected).toBe(150);
      expect(result.summary[0].invoiceCount).toBe(2);
      expect(result.details).toHaveLength(2);
    });

    it("returns empty results with no tax data", async () => {
      ctx.db.invoiceLineTax.findMany.mockResolvedValue([]);

      const result = await caller.taxLiability({ basis: "accrual" });

      expect(result.grandTotal).toBe(0);
      expect(result.summary).toEqual([]);
      expect(result.details).toEqual([]);
    });

    it("groups by tax type in summary", async () => {
      ctx.db.invoiceLineTax.findMany.mockResolvedValue([
        {
          taxId: "tax_1",
          taxAmount: 100,
          tax: { name: "GST", rate: 10 },
          invoiceLine: {
            invoice: {
              id: "inv_1", number: "INV-001", date: new Date(), total: 1100,
              status: InvoiceStatus.PAID, client: { name: "C" },
              payments: [{ amount: 1100, paidAt: new Date() }],
            },
          },
        },
        {
          taxId: "tax_2",
          taxAmount: 50,
          tax: { name: "PST", rate: 5 },
          invoiceLine: {
            invoice: {
              id: "inv_1", number: "INV-001", date: new Date(), total: 1100,
              status: InvoiceStatus.PAID, client: { name: "C" },
              payments: [{ amount: 1100, paidAt: new Date() }],
            },
          },
        },
      ]);

      const result = await caller.taxLiability({ basis: "accrual" });

      expect(result.summary).toHaveLength(2);
      const gst = result.summary.find((s: any) => s.taxName === "GST");
      const pst = result.summary.find((s: any) => s.taxName === "PST");
      expect(gst?.totalCollected).toBe(100);
      expect(pst?.totalCollected).toBe(50);
    });

    it("sorts summary by totalCollected descending", async () => {
      ctx.db.invoiceLineTax.findMany.mockResolvedValue([
        {
          taxId: "tax_1",
          taxAmount: 50,
          tax: { name: "Small Tax", rate: 5 },
          invoiceLine: {
            invoice: {
              id: "inv_1", number: "INV-001", date: new Date(), total: 1000,
              status: InvoiceStatus.PAID, client: { name: "C" },
              payments: [],
            },
          },
        },
        {
          taxId: "tax_2",
          taxAmount: 200,
          tax: { name: "Big Tax", rate: 20 },
          invoiceLine: {
            invoice: {
              id: "inv_1", number: "INV-001", date: new Date(), total: 1000,
              status: InvoiceStatus.PAID, client: { name: "C" },
              payments: [],
            },
          },
        },
      ]);

      const result = await caller.taxLiability({ basis: "accrual" });

      expect(result.summary[0].taxName).toBe("Big Tax");
      expect(result.summary[1].taxName).toBe("Small Tax");
    });

    it("uses last payment date for paymentDate in details", async () => {
      const earlier = new Date("2026-01-10");
      const later = new Date("2026-01-20");

      ctx.db.invoiceLineTax.findMany.mockResolvedValue([
        {
          taxId: "tax_1",
          taxAmount: 100,
          tax: { name: "GST", rate: 10 },
          invoiceLine: {
            invoice: {
              id: "inv_1", number: "INV-001", date: new Date(), total: 1100,
              status: InvoiceStatus.PAID, client: { name: "C" },
              payments: [
                { amount: 500, paidAt: earlier },
                { amount: 600, paidAt: later },
              ],
            },
          },
        },
      ]);

      const result = await caller.taxLiability({ basis: "accrual" });

      expect(result.details[0].paymentDate).toEqual(later);
    });

    it("sets paymentDate to null when no payments exist", async () => {
      ctx.db.invoiceLineTax.findMany.mockResolvedValue([
        {
          taxId: "tax_1",
          taxAmount: 100,
          tax: { name: "GST", rate: 10 },
          invoiceLine: {
            invoice: {
              id: "inv_1", number: "INV-001", date: new Date(), total: 1100,
              status: InvoiceStatus.SENT, client: { name: "C" },
              payments: [],
            },
          },
        },
      ]);

      const result = await caller.taxLiability({ basis: "accrual" });

      expect(result.details[0].paymentDate).toBeNull();
    });

    it("defaults to accrual basis", async () => {
      ctx.db.invoiceLineTax.findMany.mockResolvedValue([]);

      const result = await caller.taxLiability({});

      // Should call invoiceLineTax.findMany (accrual), not payment.findMany (cash)
      expect(ctx.db.invoiceLineTax.findMany).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────
  // taxLiability (cash basis)
  // ──────────────────────────────────────────────────────────
  describe("taxLiability - cash basis", () => {
    it("prorates tax by payment ratio", async () => {
      ctx.db.payment.findMany.mockResolvedValue([
        {
          amount: 500, // half of invoice total
          paidAt: new Date("2026-01-15"),
          invoice: {
            id: "inv_1",
            number: "INV-001",
            date: new Date("2026-01-01"),
            total: 1000,
            status: InvoiceStatus.PARTIALLY_PAID,
            client: { name: "Client A" },
            lines: [
              {
                taxes: [
                  { taxId: "tax_1", taxAmount: 100, tax: { name: "GST", rate: 10 } },
                ],
              },
            ],
          },
        },
      ]);

      const result = await caller.taxLiability({ basis: "cash" });

      // 100 tax * (500/1000) = 50
      expect(result.grandTotal).toBe(50);
      expect(result.details[0].taxAmount).toBe(50);
    });

    it("skips invoices with zero total", async () => {
      ctx.db.payment.findMany.mockResolvedValue([
        {
          amount: 0,
          paidAt: new Date("2026-01-15"),
          invoice: {
            id: "inv_1",
            number: "INV-001",
            date: new Date("2026-01-01"),
            total: 0,
            status: InvoiceStatus.PAID,
            client: { name: "Client A" },
            lines: [
              {
                taxes: [
                  { taxId: "tax_1", taxAmount: 100, tax: { name: "GST", rate: 10 } },
                ],
              },
            ],
          },
        },
      ]);

      const result = await caller.taxLiability({ basis: "cash" });

      expect(result.grandTotal).toBe(0);
      expect(result.details).toHaveLength(0);
    });

    it("handles multiple taxes across multiple payments", async () => {
      ctx.db.payment.findMany.mockResolvedValue([
        {
          amount: 1000,
          paidAt: new Date("2026-01-15"),
          invoice: {
            id: "inv_1",
            number: "INV-001",
            date: new Date("2026-01-01"),
            total: 1000,
            status: InvoiceStatus.PAID,
            client: { name: "Client A" },
            lines: [
              {
                taxes: [
                  { taxId: "tax_1", taxAmount: 80, tax: { name: "GST", rate: 10 } },
                  { taxId: "tax_2", taxAmount: 40, tax: { name: "PST", rate: 5 } },
                ],
              },
            ],
          },
        },
      ]);

      const result = await caller.taxLiability({ basis: "cash" });

      expect(result.grandTotal).toBe(120);
      expect(result.summary).toHaveLength(2);
    });

    it("returns empty results with no payments", async () => {
      ctx.db.payment.findMany.mockResolvedValue([]);

      const result = await caller.taxLiability({ basis: "cash" });

      expect(result.grandTotal).toBe(0);
      expect(result.summary).toEqual([]);
      expect(result.details).toEqual([]);
    });

    it("filters payments by date range", async () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-01-31");

      ctx.db.payment.findMany.mockResolvedValue([]);

      await caller.taxLiability({ basis: "cash", from, to });

      expect(ctx.db.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paidAt: { gte: from, lte: to },
          }),
        })
      );
    });

    it("counts unique invoices per tax", async () => {
      ctx.db.payment.findMany.mockResolvedValue([
        {
          amount: 500,
          paidAt: new Date("2026-01-10"),
          invoice: {
            id: "inv_1", number: "INV-001", date: new Date(), total: 1000,
            status: InvoiceStatus.PARTIALLY_PAID, client: { name: "C" },
            lines: [{ taxes: [{ taxId: "tax_1", taxAmount: 100, tax: { name: "GST", rate: 10 } }] }],
          },
        },
        {
          amount: 500,
          paidAt: new Date("2026-01-20"),
          invoice: {
            id: "inv_1", number: "INV-001", date: new Date(), total: 1000,
            status: InvoiceStatus.PAID, client: { name: "C" },
            lines: [{ taxes: [{ taxId: "tax_1", taxAmount: 100, tax: { name: "GST", rate: 10 } }] }],
          },
        },
      ]);

      const result = await caller.taxLiability({ basis: "cash" });

      // Same invoice paid twice, so invoiceCount should be 1
      expect(result.summary[0].invoiceCount).toBe(1);
      // But total collected should be sum of both prorated amounts: 50 + 50 = 100
      expect(result.summary[0].totalCollected).toBe(100);
    });
  });

  // ──────────────────────────────────────────────────────────
  // expenseCategories
  // ──────────────────────────────────────────────────────────
  describe("expenseCategories", () => {
    it("returns categories ordered by name", async () => {
      const mockCategories = [
        { id: "cat_1", name: "Advertising" },
        { id: "cat_2", name: "Software" },
        { id: "cat_3", name: "Travel" },
      ];

      ctx.db.expenseCategory.findMany.mockResolvedValue(mockCategories);

      const result = await caller.expenseCategories();

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe("Advertising");
    });

    it("filters by organizationId", async () => {
      ctx.db.expenseCategory.findMany.mockResolvedValue([]);

      await caller.expenseCategories();

      expect(ctx.db.expenseCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: "test-org-123" },
        })
      );
    });

    it("selects only id and name", async () => {
      ctx.db.expenseCategory.findMany.mockResolvedValue([]);

      await caller.expenseCategories();

      expect(ctx.db.expenseCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true, name: true },
        })
      );
    });

    it("returns empty array when no categories", async () => {
      ctx.db.expenseCategory.findMany.mockResolvedValue([]);

      const result = await caller.expenseCategories();

      expect(result).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────
  // retainerLiability
  // ──────────────────────────────────────────────────────────
  describe("retainerLiability", () => {
    it("returns retainers with positive balance and total liability", async () => {
      const mockRetainers = [
        {
          id: "ret_1",
          balance: 5000,
          updatedAt: new Date("2026-01-15"),
          client: { id: "c_1", name: "Client A", email: "a@test.com" },
        },
        {
          id: "ret_2",
          balance: 3000,
          updatedAt: new Date("2026-02-01"),
          client: { id: "c_2", name: "Client B", email: "b@test.com" },
        },
      ];

      ctx.db.retainer.findMany.mockResolvedValue(mockRetainers);

      const result = await caller.retainerLiability();

      expect(result.totalLiability).toBe(8000);
      expect(result.retainers).toHaveLength(2);
      expect(result.retainers[0]).toEqual({
        clientId: "c_1",
        clientName: "Client A",
        clientEmail: "a@test.com",
        balance: 5000,
        updatedAt: new Date("2026-01-15"),
      });
    });

    it("returns empty retainers and zero total when none found", async () => {
      ctx.db.retainer.findMany.mockResolvedValue([]);

      const result = await caller.retainerLiability();

      expect(result.retainers).toEqual([]);
      expect(result.totalLiability).toBe(0);
    });

    it("filters for retainers with balance > 0", async () => {
      ctx.db.retainer.findMany.mockResolvedValue([]);

      await caller.retainerLiability();

      expect(ctx.db.retainer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            balance: { gt: 0 },
          }),
        })
      );
    });

    it("orders retainers by balance descending", async () => {
      ctx.db.retainer.findMany.mockResolvedValue([]);

      await caller.retainerLiability();

      expect(ctx.db.retainer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { balance: "desc" },
        })
      );
    });

    it("converts BigInt balance to number", async () => {
      ctx.db.retainer.findMany.mockResolvedValue([
        {
          id: "ret_1",
          balance: BigInt(2500),
          updatedAt: new Date(),
          client: { id: "c_1", name: "Client A", email: "a@test.com" },
        },
      ]);

      const result = await caller.retainerLiability();

      expect(result.retainers[0].balance).toBe(2500);
      expect(typeof result.retainers[0].balance).toBe("number");
      expect(result.totalLiability).toBe(2500);
    });

    it("includes client relation with id, name, and email", async () => {
      ctx.db.retainer.findMany.mockResolvedValue([]);

      await caller.retainerLiability();

      expect(ctx.db.retainer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            client: { select: { id: true, name: true, email: true } },
          },
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  // Additional edge case tests for increased coverage
  // ──────────────────────────────────────────────────────────

  describe("unpaidInvoices - additional edge cases", () => {
    it("returns empty array when no matching invoices", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      const result = await caller.unpaidInvoices({});

      expect(result).toEqual([]);
    });

    it("passes all three unpaid statuses in the where clause", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.unpaidInvoices({});

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE],
            },
          }),
        })
      );
    });
  });

  describe("overdueInvoices - additional edge cases", () => {
    it("returns empty array when no overdue invoices", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      const result = await caller.overdueInvoices();

      expect(result).toEqual([]);
    });

    it("orders by dueDate ascending", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.overdueInvoices();

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { dueDate: "asc" },
        })
      );
    });

    it("includes client and currency relations", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.overdueInvoices();

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            client: { select: { id: true, name: true } },
            currency: { select: { id: true, code: true, symbol: true, symbolPosition: true } },
          }),
        })
      );
    });

    it("filters by OVERDUE status specifically (not SENT or PARTIALLY_PAID)", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.overdueInvoices();

      const callArgs = ctx.db.invoice.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe(InvoiceStatus.OVERDUE);
    });
  });

  describe("paymentsByGateway - additional edge cases", () => {
    it("filters with only from date", async () => {
      const from = new Date("2026-01-01");
      ctx.db.payment.groupBy.mockResolvedValue([]);

      await caller.paymentsByGateway({ from });

      const callArgs = ctx.db.payment.groupBy.mock.calls[0][0];
      expect(callArgs.where.paidAt).toEqual({ gte: from });
    });

    it("filters with only to date", async () => {
      const to = new Date("2026-01-31");
      ctx.db.payment.groupBy.mockResolvedValue([]);

      await caller.paymentsByGateway({ to });

      const callArgs = ctx.db.payment.groupBy.mock.calls[0][0];
      expect(callArgs.where.paidAt).toEqual({ lte: to });
    });

    it("does not add paidAt filter when no dates provided", async () => {
      ctx.db.payment.groupBy.mockResolvedValue([]);

      await caller.paymentsByGateway({});

      const callArgs = ctx.db.payment.groupBy.mock.calls[0][0];
      expect(callArgs.where.paidAt).toBeUndefined();
    });

    it("handles multiple gateways with varying data", async () => {
      ctx.db.payment.groupBy.mockResolvedValue([
        { method: "stripe", _count: 10, _sum: { amount: 50000, gatewayFee: 1500 } },
        { method: "paypal", _count: 5, _sum: { amount: 25000, gatewayFee: 750 } },
        { method: "manual", _count: 2, _sum: { amount: 10000, gatewayFee: 0 } },
      ]);

      const result = await caller.paymentsByGateway({});

      expect(Object.keys(result)).toHaveLength(3);
      expect(result.stripe.count).toBe(10);
      expect(result.paypal.total).toBe(25000);
      expect(result.manual.fees).toBe(0);
    });

    it("groups by method field", async () => {
      ctx.db.payment.groupBy.mockResolvedValue([]);

      await caller.paymentsByGateway({});

      expect(ctx.db.payment.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ["method"],
          _count: true,
          _sum: { amount: true, gatewayFee: true },
        })
      );
    });
  });

  describe("expenseBreakdown - additional edge cases", () => {
    it("filters with only from date", async () => {
      const from = new Date("2026-01-01");
      ctx.db.expense.findMany.mockResolvedValue([]);

      await caller.expenseBreakdown({ from });

      const callArgs = ctx.db.expense.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt).toEqual({ gte: from });
    });

    it("filters with only to date", async () => {
      const to = new Date("2026-01-31");
      ctx.db.expense.findMany.mockResolvedValue([]);

      await caller.expenseBreakdown({ to });

      const callArgs = ctx.db.expense.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt).toEqual({ lte: to });
    });

    it("does not add createdAt filter when no dates provided", async () => {
      ctx.db.expense.findMany.mockResolvedValue([]);

      await caller.expenseBreakdown({});

      const callArgs = ctx.db.expense.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt).toBeUndefined();
    });

    it("combines categoryId with date range filters", async () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-03-31");
      ctx.db.expense.findMany.mockResolvedValue([]);

      await caller.expenseBreakdown({ categoryId: "cat_1", from, to });

      const callArgs = ctx.db.expense.findMany.mock.calls[0][0];
      expect(callArgs.where.categoryId).toBe("cat_1");
      expect(callArgs.where.createdAt).toEqual({ gte: from, lte: to });
    });

    it("returns expenses with supplier and project relations", async () => {
      const mockExpenses = [
        {
          id: "exp_1",
          name: "Hosting",
          organizationId: "test-org-123",
          category: { id: "cat_1", name: "Infrastructure" },
          supplier: { id: "sup_1", name: "AWS" },
          project: { id: "proj_1", name: "Website" },
        },
      ];
      ctx.db.expense.findMany.mockResolvedValue(mockExpenses);

      const result = await caller.expenseBreakdown({});

      expect(result[0].supplier.name).toBe("AWS");
      expect(result[0].project.name).toBe("Website");
    });
  });

  describe("cashFlowSummary - additional edge cases", () => {
    it("uses correct date boundaries for this month", async () => {
      ctx.db.payment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 100 } })
        .mockResolvedValueOnce({ _sum: { amount: 200 } });

      await caller.cashFlowSummary();

      // First call is this month - should have gte for start of current month
      const thisMonthCall = ctx.db.payment.aggregate.mock.calls[0][0];
      const thisMonthGte = thisMonthCall.where.paidAt.gte;
      expect(thisMonthGte.getDate()).toBe(1); // First day of month

      // Second call is last month - should have gte and lte
      const lastMonthCall = ctx.db.payment.aggregate.mock.calls[1][0];
      expect(lastMonthCall.where.paidAt.gte).toBeDefined();
      expect(lastMonthCall.where.paidAt.lte).toBeDefined();
    });

    it("handles Decimal amounts correctly", async () => {
      ctx.db.payment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 1234.56 } })
        .mockResolvedValueOnce({ _sum: { amount: 789.01 } });

      const result = await caller.cashFlowSummary();

      expect(result.thisMonth).toBe(1234.56);
      expect(result.lastMonth).toBe(789.01);
    });
  });

  describe("upcomingDue - additional edge cases", () => {
    it("returns empty array when no invoices due soon", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      const result = await caller.upcomingDue();

      expect(result).toEqual([]);
    });

    it("orders results by dueDate ascending", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.upcomingDue();

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { dueDate: "asc" },
        })
      );
    });

    it("includes client name and currency in results", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.upcomingDue();

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            client: { select: { name: true } },
          }),
        })
      );
    });

    it("filters by organizationId", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.upcomingDue();

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
          }),
        })
      );
    });
  });

  describe("revenueByMonth - additional edge cases", () => {
    it("handles many months of data", async () => {
      ctx.db.$queryRaw.mockResolvedValue([
        { month: "2025-10", total: 1000 },
        { month: "2025-11", total: 2000 },
        { month: "2025-12", total: 3000 },
        { month: "2026-01", total: 4000 },
        { month: "2026-02", total: 5000 },
      ]);

      const result = await caller.revenueByMonth({});

      expect(Object.keys(result)).toHaveLength(5);
      expect(result["2025-10"]).toBe(1000);
      expect(result["2026-02"]).toBe(5000);
    });

    it("handles zero total for a month", async () => {
      ctx.db.$queryRaw.mockResolvedValue([
        { month: "2026-01", total: 0 },
      ]);

      const result = await caller.revenueByMonth({});

      expect(result["2026-01"]).toBe(0);
    });

    it("handles float totals", async () => {
      ctx.db.$queryRaw.mockResolvedValue([
        { month: "2026-01", total: 1234.56 },
      ]);

      const result = await caller.revenueByMonth({});

      expect(result["2026-01"]).toBe(1234.56);
    });
  });

  describe("profitLoss - additional edge cases", () => {
    it("includes credits in net income calculation", async () => {
      ctx.db.payment.findMany.mockResolvedValue([
        { amount: 5000, paidAt: new Date("2026-01-15") },
      ]);
      ctx.db.expense.findMany.mockResolvedValue([
        { rate: 200, qty: 3, createdAt: new Date("2026-01-10") },
      ]);
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([
        { amount: 500, createdAt: new Date("2026-01-20") },
        { amount: 300, createdAt: new Date("2026-01-25") },
      ]);

      const result = await caller.profitLoss({});

      expect(result.totalRevenue).toBe(5000);
      expect(result.totalExpenses).toBe(600);
      expect(result.totalCredits).toBe(800);
      expect(result.netIncome).toBe(5000 - 600 - 800);
    });

    it("merges all months from revenue, expenses, and credits", async () => {
      ctx.db.payment.findMany.mockResolvedValue([
        { amount: 1000, paidAt: new Date("2026-01-15") },
      ]);
      ctx.db.expense.findMany.mockResolvedValue([
        { rate: 100, qty: 1, createdAt: new Date("2026-02-10") },
      ]);
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([
        { amount: 50, createdAt: new Date("2026-03-05") },
      ]);

      const result = await caller.profitLoss({});

      expect(Object.keys(result.netByMonth).sort()).toEqual(["2026-01", "2026-02", "2026-03"]);
      expect(result.netByMonth["2026-01"]).toBe(1000);
      expect(result.netByMonth["2026-02"]).toBe(-100);
      expect(result.netByMonth["2026-03"]).toBe(-50);
    });

    it("filters expenses by date range", async () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-01-31");

      ctx.db.payment.findMany.mockResolvedValue([]);
      ctx.db.expense.findMany.mockResolvedValue([]);
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([]);

      await caller.profitLoss({ from, to });

      expect(ctx.db.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: from, lte: to },
          }),
        })
      );
    });

    it("filters invoices (discounts) by date range", async () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-01-31");

      ctx.db.payment.findMany.mockResolvedValue([]);
      ctx.db.expense.findMany.mockResolvedValue([]);
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([]);

      await caller.profitLoss({ from, to });

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: { gte: from, lte: to },
          }),
        })
      );
    });

    it("filters credit note applications by date range", async () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-01-31");

      ctx.db.payment.findMany.mockResolvedValue([]);
      ctx.db.expense.findMany.mockResolvedValue([]);
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([]);

      await caller.profitLoss({ from, to });

      expect(ctx.db.creditNoteApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: from, lte: to },
          }),
        })
      );
    });

    it("does not add date filters when no dates provided", async () => {
      ctx.db.payment.findMany.mockResolvedValue([]);
      ctx.db.expense.findMany.mockResolvedValue([]);
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([]);

      await caller.profitLoss({});

      const paymentCallArgs = ctx.db.payment.findMany.mock.calls[0][0];
      expect(paymentCallArgs.where.paidAt).toBeUndefined();

      const expenseCallArgs = ctx.db.expense.findMany.mock.calls[0][0];
      expect(expenseCallArgs.where.createdAt).toBeUndefined();
    });

    it("excludes DRAFT invoices from discount calculation", async () => {
      ctx.db.payment.findMany.mockResolvedValue([]);
      ctx.db.expense.findMany.mockResolvedValue([]);
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([]);

      await caller.profitLoss({});

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { notIn: [InvoiceStatus.DRAFT] },
            discountType: { not: null },
            discountAmount: { gt: 0 },
          }),
        })
      );
    });

    it("handles large number of payments and expenses across months", async () => {
      const payments = Array.from({ length: 12 }, (_, i) => ({
        amount: 1000 + i * 100,
        paidAt: new Date(2026, i, 15),
      }));
      const expenses = Array.from({ length: 6 }, (_, i) => ({
        rate: 50,
        qty: 2,
        createdAt: new Date(2026, i * 2, 10),
      }));

      ctx.db.payment.findMany.mockResolvedValue(payments);
      ctx.db.expense.findMany.mockResolvedValue(expenses);
      ctx.db.invoice.findMany.mockResolvedValue([]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([]);

      const result = await caller.profitLoss({});

      const expectedRevenue = payments.reduce((s, p) => s + p.amount, 0);
      const expectedExpenses = expenses.reduce((s, e) => s + e.rate * e.qty, 0);
      expect(result.totalRevenue).toBe(expectedRevenue);
      expect(result.totalExpenses).toBe(expectedExpenses);
      expect(result.netIncome).toBe(expectedRevenue - expectedExpenses);
    });

    it("handles zero discount amount", async () => {
      ctx.db.payment.findMany.mockResolvedValue([]);
      ctx.db.expense.findMany.mockResolvedValue([]);
      // Router filters discountAmount: { gt: 0 } so these shouldn't appear,
      // but if they somehow do, the calculation should still work
      ctx.db.invoice.findMany.mockResolvedValue([
        { discountType: "percentage", discountAmount: 0, subtotal: 1000 },
      ]);
      ctx.db.creditNoteApplication.findMany.mockResolvedValue([]);

      const result = await caller.profitLoss({});

      expect(result.totalDiscountsGiven).toBe(0);
    });
  });

  describe("invoiceAging - boundary conditions", () => {
    const now = Date.now();

    function makeInvoice(id: string, dueDate: Date) {
      return {
        id,
        status: InvoiceStatus.OVERDUE,
        isArchived: false,
        total: 1000,
        dueDate,
        client: { name: "Client" },
        currency: { id: "cur_1", code: "USD", symbol: "$", symbolPosition: "before" },
      };
    }

    it("puts invoice due today in current bucket (daysOverdue = 0)", async () => {
      const today = new Date(now);
      ctx.db.invoice.findMany.mockResolvedValue([makeInvoice("inv_1", today)]);

      const result = await caller.invoiceAging();

      expect(result.current).toHaveLength(1);
      expect(result.current[0].daysOverdue).toBe(0);
    });

    it("filters for correct statuses", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.invoiceAging();

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE],
            },
          }),
        })
      );
    });

    it("filters by organizationId and excludes archived", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([]);

      await caller.invoiceAging();

      expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
            isArchived: false,
          }),
        })
      );
    });

    it("preserves original invoice fields in enriched result", async () => {
      const dueDate = new Date(now - 5 * 86400000);
      const inv = {
        ...makeInvoice("inv_1", dueDate),
        number: "INV-123",
        total: 5000,
      };
      ctx.db.invoice.findMany.mockResolvedValue([inv]);

      const result = await caller.invoiceAging();

      expect(result.days1_30[0].id).toBe("inv_1");
      expect(result.days1_30[0].number).toBe("INV-123");
      expect(result.days1_30[0].total).toBe(5000);
      expect(result.days1_30[0]).toHaveProperty("daysOverdue");
    });

    it("handles multiple invoices in the same bucket", async () => {
      ctx.db.invoice.findMany.mockResolvedValue([
        makeInvoice("inv_1", new Date(now - 5 * 86400000)),
        makeInvoice("inv_2", new Date(now - 10 * 86400000)),
        makeInvoice("inv_3", new Date(now - 25 * 86400000)),
      ]);

      const result = await caller.invoiceAging();

      expect(result.days1_30).toHaveLength(3);
    });
  });

  describe("timeTracking - additional edge cases", () => {
    it("handles BigInt minutes", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([
        {
          id: "te_1",
          projectId: "proj_1",
          minutes: BigInt(90),
          project: { id: "proj_1", name: "Website", rate: 100, client: { name: "Client A" } },
        },
      ]);

      const result = await caller.timeTracking({});

      expect(result[0].totalMinutes).toBe(90);
      expect(result[0].billableAmount).toBe((90 / 60) * 100);
    });

    it("handles Decimal project rate", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([
        {
          id: "te_1",
          projectId: "proj_1",
          minutes: 60,
          project: { id: "proj_1", name: "Website", rate: "150.50", client: { name: "Client A" } },
        },
      ]);

      const result = await caller.timeTracking({});

      // Number("150.50") = 150.5, (60/60) * 150.5 = 150.5
      expect(result[0].billableAmount).toBe(150.5);
    });

    it("does not add date filter when no dates provided", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      await caller.timeTracking({});

      const callArgs = ctx.db.timeEntry.findMany.mock.calls[0][0];
      expect(callArgs.where.date).toBeUndefined();
    });

    it("filters with only from date", async () => {
      const from = new Date("2026-01-01");
      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      await caller.timeTracking({ from });

      const callArgs = ctx.db.timeEntry.findMany.mock.calls[0][0];
      expect(callArgs.where.date).toEqual({ gte: from });
    });

    it("filters with only to date", async () => {
      const to = new Date("2026-01-31");
      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      await caller.timeTracking({ to });

      const callArgs = ctx.db.timeEntry.findMany.mock.calls[0][0];
      expect(callArgs.where.date).toEqual({ lte: to });
    });

    it("accumulates minutes from multiple entries for the same project", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([
        {
          id: "te_1",
          projectId: "proj_1",
          minutes: 30,
          project: { id: "proj_1", name: "Website", rate: 100, client: { name: "C" } },
        },
        {
          id: "te_2",
          projectId: "proj_1",
          minutes: 45,
          project: { id: "proj_1", name: "Website", rate: 100, client: { name: "C" } },
        },
        {
          id: "te_3",
          projectId: "proj_1",
          minutes: 15,
          project: { id: "proj_1", name: "Website", rate: 100, client: { name: "C" } },
        },
      ]);

      const result = await caller.timeTracking({});

      expect(result).toHaveLength(1);
      expect(result[0].totalMinutes).toBe(90);
      expect(result[0].billableAmount).toBe((90 / 60) * 100);
    });

    it("filters by organizationId", async () => {
      ctx.db.timeEntry.findMany.mockResolvedValue([]);

      await caller.timeTracking({});

      expect(ctx.db.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
          }),
        })
      );
    });
  });

  describe("taxLiability - accrual additional edge cases", () => {
    it("filters by date range on invoice date", async () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-03-31");
      ctx.db.invoiceLineTax.findMany.mockResolvedValue([]);

      await caller.taxLiability({ basis: "accrual", from, to });

      expect(ctx.db.invoiceLineTax.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            invoiceLine: {
              invoice: expect.objectContaining({
                date: { gte: from, lte: to },
              }),
            },
          },
        })
      );
    });

    it("excludes credit notes", async () => {
      ctx.db.invoiceLineTax.findMany.mockResolvedValue([]);

      await caller.taxLiability({ basis: "accrual" });

      expect(ctx.db.invoiceLineTax.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            invoiceLine: {
              invoice: expect.objectContaining({
                type: { not: InvoiceType.CREDIT_NOTE },
              }),
            },
          },
        })
      );
    });

    it("excludes draft invoices", async () => {
      ctx.db.invoiceLineTax.findMany.mockResolvedValue([]);

      await caller.taxLiability({ basis: "accrual" });

      expect(ctx.db.invoiceLineTax.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            invoiceLine: {
              invoice: expect.objectContaining({
                status: { notIn: [InvoiceStatus.DRAFT] },
              }),
            },
          },
        })
      );
    });

    it("counts unique invoices per tax in summary", async () => {
      // Two line taxes from the same invoice for the same tax
      const invoiceData = {
        id: "inv_1", number: "INV-001", date: new Date(), total: 1100,
        status: InvoiceStatus.PAID, client: { name: "C" },
        payments: [{ amount: 1100, paidAt: new Date() }],
      };
      ctx.db.invoiceLineTax.findMany.mockResolvedValue([
        {
          taxId: "tax_1", taxAmount: 50,
          tax: { name: "GST", rate: 10 },
          invoiceLine: { invoice: invoiceData },
        },
        {
          taxId: "tax_1", taxAmount: 50,
          tax: { name: "GST", rate: 10 },
          invoiceLine: { invoice: invoiceData },
        },
      ]);

      const result = await caller.taxLiability({ basis: "accrual" });

      expect(result.summary[0].totalCollected).toBe(100);
      expect(result.summary[0].invoiceCount).toBe(1); // Same invoice counted once
    });

    it("populates detail fields correctly", async () => {
      const invoiceDate = new Date("2026-02-15");
      const paymentDate = new Date("2026-02-20");
      ctx.db.invoiceLineTax.findMany.mockResolvedValue([
        {
          taxId: "tax_1", taxAmount: 75,
          tax: { name: "HST", rate: 13 },
          invoiceLine: {
            invoice: {
              id: "inv_1", number: "INV-100", date: invoiceDate, total: 575,
              status: InvoiceStatus.PAID, client: { name: "Acme Corp" },
              payments: [{ amount: 575, paidAt: paymentDate }],
            },
          },
        },
      ]);

      const result = await caller.taxLiability({ basis: "accrual" });

      expect(result.details[0]).toEqual({
        invoiceNumber: "INV-100",
        clientName: "Acme Corp",
        invoiceDate,
        invoiceTotal: 575,
        taxName: "HST",
        taxRate: 13,
        taxAmount: 75,
        paymentStatus: InvoiceStatus.PAID,
        paymentDate,
      });
    });

    it("does not add date filter when no dates provided", async () => {
      ctx.db.invoiceLineTax.findMany.mockResolvedValue([]);

      await caller.taxLiability({ basis: "accrual" });

      const callArgs = ctx.db.invoiceLineTax.findMany.mock.calls[0][0];
      const invoiceWhere = callArgs.where.invoiceLine.invoice;
      expect(invoiceWhere.date).toBeUndefined();
    });
  });

  describe("taxLiability - cash additional edge cases", () => {
    it("excludes credit notes from payment query", async () => {
      ctx.db.payment.findMany.mockResolvedValue([]);

      await caller.taxLiability({ basis: "cash" });

      expect(ctx.db.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            invoice: { type: { not: InvoiceType.CREDIT_NOTE } },
          }),
        })
      );
    });

    it("does not add paidAt filter when no dates provided", async () => {
      ctx.db.payment.findMany.mockResolvedValue([]);

      await caller.taxLiability({ basis: "cash" });

      const callArgs = ctx.db.payment.findMany.mock.calls[0][0];
      expect(callArgs.where.paidAt).toBeUndefined();
    });

    it("handles multiple lines with multiple taxes per payment", async () => {
      ctx.db.payment.findMany.mockResolvedValue([
        {
          amount: 1000,
          paidAt: new Date("2026-01-15"),
          invoice: {
            id: "inv_1", number: "INV-001", date: new Date("2026-01-01"),
            total: 1000, status: InvoiceStatus.PAID, client: { name: "C" },
            lines: [
              {
                taxes: [
                  { taxId: "tax_1", taxAmount: 50, tax: { name: "GST", rate: 5 } },
                ],
              },
              {
                taxes: [
                  { taxId: "tax_1", taxAmount: 30, tax: { name: "GST", rate: 5 } },
                  { taxId: "tax_2", taxAmount: 20, tax: { name: "PST", rate: 7 } },
                ],
              },
            ],
          },
        },
      ]);

      const result = await caller.taxLiability({ basis: "cash" });

      // payment ratio = 1000/1000 = 1, so all tax amounts are full
      const gst = result.summary.find((s: any) => s.taxName === "GST");
      const pst = result.summary.find((s: any) => s.taxName === "PST");
      expect(gst?.totalCollected).toBe(80); // 50 + 30
      expect(pst?.totalCollected).toBe(20);
      expect(result.grandTotal).toBe(100);
      expect(result.details).toHaveLength(3);
    });

    it("prorates correctly for partial payment", async () => {
      ctx.db.payment.findMany.mockResolvedValue([
        {
          amount: 250, // 25% of 1000
          paidAt: new Date("2026-01-15"),
          invoice: {
            id: "inv_1", number: "INV-001", date: new Date("2026-01-01"),
            total: 1000, status: InvoiceStatus.PARTIALLY_PAID, client: { name: "C" },
            lines: [
              {
                taxes: [
                  { taxId: "tax_1", taxAmount: 100, tax: { name: "GST", rate: 10 } },
                ],
              },
            ],
          },
        },
      ]);

      const result = await caller.taxLiability({ basis: "cash" });

      // 100 * (250/1000) = 25
      expect(result.grandTotal).toBe(25);
      expect(result.details[0].taxAmount).toBe(25);
    });

    it("sorts summary by totalCollected descending", async () => {
      ctx.db.payment.findMany.mockResolvedValue([
        {
          amount: 1000,
          paidAt: new Date("2026-01-15"),
          invoice: {
            id: "inv_1", number: "INV-001", date: new Date(), total: 1000,
            status: InvoiceStatus.PAID, client: { name: "C" },
            lines: [
              {
                taxes: [
                  { taxId: "tax_1", taxAmount: 30, tax: { name: "Small", rate: 3 } },
                  { taxId: "tax_2", taxAmount: 100, tax: { name: "Big", rate: 10 } },
                ],
              },
            ],
          },
        },
      ]);

      const result = await caller.taxLiability({ basis: "cash" });

      expect(result.summary[0].taxName).toBe("Big");
      expect(result.summary[1].taxName).toBe("Small");
    });

    it("includes payment date in details", async () => {
      const paymentDate = new Date("2026-02-15");
      ctx.db.payment.findMany.mockResolvedValue([
        {
          amount: 500,
          paidAt: paymentDate,
          invoice: {
            id: "inv_1", number: "INV-001", date: new Date(), total: 500,
            status: InvoiceStatus.PAID, client: { name: "C" },
            lines: [
              { taxes: [{ taxId: "tax_1", taxAmount: 50, tax: { name: "GST", rate: 10 } }] },
            ],
          },
        },
      ]);

      const result = await caller.taxLiability({ basis: "cash" });

      expect(result.details[0].paymentDate).toEqual(paymentDate);
    });

    it("filters with only from date", async () => {
      const from = new Date("2026-01-01");
      ctx.db.payment.findMany.mockResolvedValue([]);

      await caller.taxLiability({ basis: "cash", from });

      const callArgs = ctx.db.payment.findMany.mock.calls[0][0];
      expect(callArgs.where.paidAt).toEqual({ gte: from });
    });

    it("filters with only to date", async () => {
      const to = new Date("2026-03-31");
      ctx.db.payment.findMany.mockResolvedValue([]);

      await caller.taxLiability({ basis: "cash", to });

      const callArgs = ctx.db.payment.findMany.mock.calls[0][0];
      expect(callArgs.where.paidAt).toEqual({ lte: to });
    });
  });

  describe("expenseCategories - additional edge cases", () => {
    it("orders by name ascending", async () => {
      ctx.db.expenseCategory.findMany.mockResolvedValue([]);

      await caller.expenseCategories();

      expect(ctx.db.expenseCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: "asc" },
        })
      );
    });

    it("handles many categories", async () => {
      const cats = Array.from({ length: 20 }, (_, i) => ({
        id: `cat_${i}`,
        name: `Category ${String(i).padStart(2, "0")}`,
      }));
      ctx.db.expenseCategory.findMany.mockResolvedValue(cats);

      const result = await caller.expenseCategories();

      expect(result).toHaveLength(20);
    });
  });

  describe("retainerLiability - additional edge cases", () => {
    it("handles many retainers and calculates total correctly", async () => {
      const retainers = Array.from({ length: 5 }, (_, i) => ({
        id: `ret_${i}`,
        balance: (i + 1) * 1000,
        updatedAt: new Date(`2026-0${i + 1}-01`),
        client: { id: `c_${i}`, name: `Client ${i}`, email: `c${i}@test.com` },
      }));
      ctx.db.retainer.findMany.mockResolvedValue(retainers);

      const result = await caller.retainerLiability();

      expect(result.retainers).toHaveLength(5);
      expect(result.totalLiability).toBe(1000 + 2000 + 3000 + 4000 + 5000);
    });

    it("maps retainer fields correctly", async () => {
      const updatedAt = new Date("2026-03-15");
      ctx.db.retainer.findMany.mockResolvedValue([
        {
          id: "ret_1",
          balance: 2500,
          updatedAt,
          client: { id: "c_1", name: "Test Client", email: "test@example.com" },
        },
      ]);

      const result = await caller.retainerLiability();

      expect(result.retainers[0]).toEqual({
        clientId: "c_1",
        clientName: "Test Client",
        clientEmail: "test@example.com",
        balance: 2500,
        updatedAt,
      });
    });

    it("filters by organizationId", async () => {
      ctx.db.retainer.findMany.mockResolvedValue([]);

      await caller.retainerLiability();

      expect(ctx.db.retainer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
          }),
        })
      );
    });
  });

  describe("groupByMonth - additional edge cases", () => {
    it("handles items spanning multiple years", () => {
      const items = [
        { d: new Date("2025-12-15"), v: 100 },
        { d: new Date("2026-01-15"), v: 200 },
        { d: new Date("2026-12-15"), v: 300 },
        { d: new Date("2027-01-15"), v: 400 },
      ];
      const result = groupByMonth(items, (i) => i.d, (i) => i.v);
      expect(result).toEqual({
        "2025-12": 100,
        "2026-01": 200,
        "2026-12": 300,
        "2027-01": 400,
      });
    });

    it("accumulates values for the same month", () => {
      const items = [
        { d: new Date("2026-06-01"), v: 10 },
        { d: new Date("2026-06-15"), v: 20 },
        { d: new Date("2026-06-30"), v: 30 },
      ];
      const result = groupByMonth(items, (i) => i.d, (i) => i.v);
      expect(result).toEqual({ "2026-06": 60 });
    });

    it("handles negative values", () => {
      const items = [
        { d: new Date("2026-01-15"), v: 100 },
        { d: new Date("2026-01-20"), v: -50 },
      ];
      const result = groupByMonth(items, (i) => i.d, (i) => i.v);
      expect(result).toEqual({ "2026-01": 50 });
    });

    it("handles decimal values", () => {
      const items = [
        { d: new Date("2026-03-10"), v: 33.33 },
        { d: new Date("2026-03-20"), v: 66.67 },
      ];
      const result = groupByMonth(items, (i) => i.d, (i) => i.v);
      expect(result["2026-03"]).toBeCloseTo(100, 2);
    });

    it("pads single-digit months correctly", () => {
      const items = [
        { d: new Date("2026-01-01"), v: 1 },
        { d: new Date("2026-09-01"), v: 9 },
      ];
      const result = groupByMonth(items, (i) => i.d, (i) => i.v);
      expect(Object.keys(result)).toContain("2026-01");
      expect(Object.keys(result)).toContain("2026-09");
      // Should NOT have unpadded months
      expect(Object.keys(result)).not.toContain("2026-1");
      expect(Object.keys(result)).not.toContain("2026-9");
    });
  });
});
