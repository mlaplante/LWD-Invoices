import { describe, it, expect, beforeEach, vi } from "vitest";
import { expensesRouter } from "@/server/routers/expenses";
import { createMockContext } from "./mocks/trpc-context";
import { Decimal } from "@prisma/client-runtime-utils";

// Mock the recurring expense generator to avoid real service calls
vi.mock("@/server/services/recurring-expense-generator", () => ({
  generateExpensesForRecurring: vi.fn().mockResolvedValue(undefined),
}));

// Mock tax-calculator for billToInvoice
vi.mock("@/server/services/tax-calculator", () => ({
  calculateLineTotals: vi.fn().mockReturnValue({
    subtotal: 100,
    taxTotal: 10,
    total: 110,
    taxBreakdown: [],
  }),
  calculateInvoiceTotals: vi.fn().mockReturnValue({
    subtotal: 200,
    discountTotal: 0,
    taxTotal: 20,
    total: 220,
  }),
  getOrgTaxMap: vi.fn().mockResolvedValue(new Map()),
}));

function makeExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: "e_1",
    name: "Office Supplies",
    description: null,
    qty: 1,
    rate: new Decimal("100"),
    organizationId: "test-org-123",
    projectId: null,
    dueDate: null,
    paidAt: null,
    reimbursable: false,
    paymentDetails: null,
    receiptUrl: null,
    invoiceLineId: null,
    taxId: null,
    categoryId: null,
    supplierId: null,
    ocrRawResult: null,
    ocrConfidence: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    tax: null,
    category: null,
    supplier: null,
    project: null,
    ...overrides,
  };
}

describe("Expenses Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = expensesRouter.createCaller(ctx);
  });

  // ───────── list ─────────
  describe("list", () => {
    it("returns all expenses for organization", async () => {
      ctx.db.expense.findMany.mockResolvedValue([
        makeExpense({
          category: { id: "cat_1", name: "Office", organizationId: "test-org-123", createdAt: new Date(), updatedAt: new Date() },
          supplier: { id: "sup_1", name: "Staples", organizationId: "test-org-123", createdAt: new Date(), updatedAt: new Date() },
        }),
      ]);

      const result = await caller.list({});

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Office Supplies");
      expect(ctx.db.expense.findMany).toHaveBeenCalledWith({
        where: { organizationId: "test-org-123" },
        include: {
          tax: true,
          category: true,
          supplier: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    });

    it("filters expenses by project", async () => {
      ctx.db.expense.findMany.mockResolvedValue([
        makeExpense({ id: "e_2", name: "Project Expense", projectId: "p_1", project: { id: "p_1", name: "Test Project" } }),
      ]);

      const result = await caller.list({ projectId: "p_1" });

      expect(result).toHaveLength(1);
      expect(result[0].projectId).toBe("p_1");
      expect(ctx.db.expense.findMany).toHaveBeenCalledWith({
        where: { organizationId: "test-org-123", projectId: "p_1" },
        include: expect.any(Object),
        orderBy: { createdAt: "desc" },
      });
    });

    it("filters unbilled expenses only", async () => {
      ctx.db.expense.findMany.mockResolvedValue([
        makeExpense({ id: "e_3", name: "Unbilled Expense", rate: new Decimal("75") }),
      ]);

      const result = await caller.list({ unbilledOnly: true });

      expect(result).toHaveLength(1);
      expect(result[0].invoiceLineId).toBeNull();
      expect(ctx.db.expense.findMany).toHaveBeenCalledWith({
        where: { organizationId: "test-org-123", invoiceLineId: null },
        include: expect.any(Object),
        orderBy: { createdAt: "desc" },
      });
    });

    it("combines projectId and unbilledOnly filters", async () => {
      ctx.db.expense.findMany.mockResolvedValue([]);

      await caller.list({ projectId: "p_1", unbilledOnly: true });

      expect(ctx.db.expense.findMany).toHaveBeenCalledWith({
        where: { organizationId: "test-org-123", projectId: "p_1", invoiceLineId: null },
        include: expect.any(Object),
        orderBy: { createdAt: "desc" },
      });
    });

    it("returns empty array when no expenses exist", async () => {
      ctx.db.expense.findMany.mockResolvedValue([]);

      const result = await caller.list({});

      expect(result).toHaveLength(0);
    });
  });

  // ───────── getById ─────────
  describe("getById", () => {
    it("returns expense with all relations", async () => {
      ctx.db.expense.findUnique.mockResolvedValue(
        makeExpense({
          id: "e_1",
          name: "Detailed Expense",
          description: "Full expense details",
          qty: 3,
          rate: new Decimal("150"),
          projectId: "p_1",
          dueDate: new Date("2026-03-31"),
          paidAt: new Date("2026-02-26"),
          reimbursable: true,
          paymentDetails: "Direct deposit",
          receiptUrl: "https://example.com/receipt.pdf",
          taxId: "tax_1",
          categoryId: "cat_1",
          supplierId: "sup_1",
          tax: { id: "tax_1", rate: new Decimal("0.1"), isCompound: false, name: "VAT", organizationId: "test-org-123", createdAt: new Date(), updatedAt: new Date() },
          category: { id: "cat_1", name: "Equipment", organizationId: "test-org-123", createdAt: new Date(), updatedAt: new Date() },
          supplier: { id: "sup_1", name: "Tech Supplier", organizationId: "test-org-123", createdAt: new Date(), updatedAt: new Date() },
          project: { id: "p_1", name: "Main Project" },
        }),
      );

      const result = await caller.getById({ id: "e_1" });

      expect(result.id).toBe("e_1");
      expect(result.name).toBe("Detailed Expense");
      expect(result.tax).toBeDefined();
      expect(result.category).toBeDefined();
      expect(result.supplier).toBeDefined();
      expect(result.project).toBeDefined();
    });

    it("throws NOT_FOUND when expense doesn't exist", async () => {
      ctx.db.expense.findUnique.mockResolvedValue(null);

      try {
        await caller.getById({ id: "e_nonexistent" });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });

    it("scopes query to organization", async () => {
      ctx.db.expense.findUnique.mockResolvedValue(makeExpense());

      await caller.getById({ id: "e_1" });

      expect(ctx.db.expense.findUnique).toHaveBeenCalledWith({
        where: { id: "e_1", organizationId: "test-org-123" },
        include: {
          tax: true,
          category: true,
          supplier: true,
          project: { select: { id: true, name: true } },
        },
      });
    });
  });

  // ───────── create ─────────
  describe("create", () => {
    it("creates expense with required fields only", async () => {
      ctx.db.expense.create.mockResolvedValue(makeExpense({ id: "e_new", name: "New Expense", rate: new Decimal("50") }));

      const result = await caller.create({ name: "New Expense", rate: 50 });

      expect(result.id).toBe("e_new");
      expect(result.name).toBe("New Expense");
      expect(ctx.db.expense.create).toHaveBeenCalled();
    });

    it("creates expense with all optional fields", async () => {
      ctx.db.expense.create.mockResolvedValue(
        makeExpense({
          id: "e_full",
          name: "Full Expense",
          description: "Complete expense record",
          qty: 5,
          rate: new Decimal("200"),
          projectId: "p_1",
          dueDate: new Date("2026-03-31"),
          paidAt: new Date("2026-02-26"),
          reimbursable: true,
          paymentDetails: "Paid by credit card",
          receiptUrl: "https://example.com/receipt.jpg",
          taxId: "tax_1",
          categoryId: "cat_1",
          supplierId: "sup_1",
        }),
      );

      const result = await caller.create({
        name: "Full Expense",
        description: "Complete expense record",
        qty: 5,
        rate: 200,
        projectId: "p_1",
        dueDate: new Date("2026-03-31"),
        paidAt: new Date("2026-02-26"),
        reimbursable: true,
        paymentDetails: "Paid by credit card",
        receiptUrl: "https://example.com/receipt.jpg",
        taxId: "tax_1",
        categoryId: "cat_1",
        supplierId: "sup_1",
      });

      expect(result.description).toBe("Complete expense record");
      expect(result.projectId).toBe("p_1");
      expect(result.reimbursable).toBe(true);
      expect(result.taxId).toBe("tax_1");
    });

    it("creates expense with default qty=1", async () => {
      ctx.db.expense.create.mockResolvedValue(makeExpense({ id: "e_default", name: "Default Qty Expense" }));

      const result = await caller.create({ name: "Default Qty Expense", rate: 100 });

      expect(result.qty).toBe(1);
    });

    it("creates expense with OCR fields", async () => {
      const ocrData = { vendor: "Staples", amount: "99.99", date: "2026-03-15" };
      ctx.db.expense.create.mockResolvedValue(
        makeExpense({ id: "e_ocr", name: "OCR Expense", ocrRawResult: ocrData, ocrConfidence: 0.95 }),
      );

      const result = await caller.create({
        name: "OCR Expense",
        rate: 99.99,
        ocrRawResult: ocrData,
        ocrConfidence: 0.95,
      });

      expect(result.ocrRawResult).toEqual(ocrData);
      expect(result.ocrConfidence).toBe(0.95);
      expect(ctx.db.expense.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ocrRawResult: ocrData,
            ocrConfidence: 0.95,
          }),
        }),
      );
    });

    it("passes organizationId from context", async () => {
      ctx.db.expense.create.mockResolvedValue(makeExpense());

      await caller.create({ name: "Test", rate: 10 });

      expect(ctx.db.expense.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: "test-org-123" }),
        }),
      );
    });

    it("includes related records in response", async () => {
      ctx.db.expense.create.mockResolvedValue(makeExpense());

      await caller.create({ name: "Test", rate: 10 });

      expect(ctx.db.expense.create).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            tax: true,
            category: true,
            supplier: true,
            project: { select: { id: true, name: true } },
          },
        }),
      );
    });
  });

  // ───────── update ─────────
  describe("update", () => {
    it("updates expense with all fields", async () => {
      ctx.db.expense.findUnique.mockResolvedValue(makeExpense());
      ctx.db.expense.update.mockResolvedValue(
        makeExpense({ name: "Updated Expense", qty: 10, rate: new Decimal("300") }),
      );

      const result = await caller.update({
        id: "e_1",
        name: "Updated Expense",
        description: "Updated description",
        qty: 10,
        rate: 300,
        projectId: "p_2",
        dueDate: new Date("2026-04-30"),
        paidAt: new Date("2026-02-27"),
        reimbursable: true,
        paymentDetails: "Updated payment details",
        receiptUrl: "https://example.com/new-receipt.pdf",
        taxId: "tax_2",
        categoryId: "cat_2",
        supplierId: "sup_2",
      });

      expect(result.name).toBe("Updated Expense");
      expect(result.qty).toBe(10);
      expect(ctx.db.expense.update).toHaveBeenCalled();
    });

    it("updates expense with partial fields", async () => {
      ctx.db.expense.findUnique.mockResolvedValue(makeExpense());
      ctx.db.expense.update.mockResolvedValue(makeExpense({ name: "Partial Update" }));

      const result = await caller.update({ id: "e_1", name: "Partial Update" });

      expect(result.name).toBe("Partial Update");
      expect(ctx.db.expense.update).toHaveBeenCalledWith({
        where: { id: "e_1", organizationId: "test-org-123" },
        data: { name: "Partial Update" },
        include: expect.any(Object),
      });
    });

    it("throws NOT_FOUND when expense does not exist", async () => {
      ctx.db.expense.findUnique.mockResolvedValue(null);

      try {
        await caller.update({ id: "e_missing", name: "Nope" });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });

    it("clears nullable fields when set to null", async () => {
      ctx.db.expense.findUnique.mockResolvedValue(makeExpense({ taxId: "tax_1", categoryId: "cat_1" }));
      ctx.db.expense.update.mockResolvedValue(makeExpense({ taxId: null, categoryId: null }));

      await caller.update({ id: "e_1", taxId: null, categoryId: null, supplierId: null });

      expect(ctx.db.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ taxId: null, categoryId: null, supplierId: null }),
        }),
      );
    });

    it("updates OCR fields", async () => {
      const ocrData = { vendor: "NewVendor" };
      ctx.db.expense.findUnique.mockResolvedValue(makeExpense());
      ctx.db.expense.update.mockResolvedValue(makeExpense({ ocrRawResult: ocrData, ocrConfidence: 0.8 }));

      await caller.update({ id: "e_1", ocrRawResult: ocrData, ocrConfidence: 0.8 });

      expect(ctx.db.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ocrRawResult: ocrData, ocrConfidence: 0.8 }),
        }),
      );
    });

    it("clears OCR fields when set to null", async () => {
      ctx.db.expense.findUnique.mockResolvedValue(makeExpense({ ocrRawResult: { foo: "bar" } }));
      ctx.db.expense.update.mockResolvedValue(makeExpense({ ocrRawResult: null, ocrConfidence: null }));

      await caller.update({ id: "e_1", ocrRawResult: null, ocrConfidence: null });

      expect(ctx.db.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ocrRawResult: null, ocrConfidence: null }),
        }),
      );
    });
  });

  // ───────── delete ─────────
  describe("delete", () => {
    it("deletes unbilled expense", async () => {
      ctx.db.expense.findUnique.mockResolvedValue(makeExpense({ invoiceLineId: null }));
      ctx.db.expense.delete.mockResolvedValue(makeExpense({ id: "e_1" }));

      const result = await caller.delete({ id: "e_1" });

      expect(result.id).toBe("e_1");
      expect(ctx.db.expense.delete).toHaveBeenCalledWith({
        where: { id: "e_1", organizationId: "test-org-123" },
      });
    });

    it("prevents deleting billed expense", async () => {
      ctx.db.expense.findUnique.mockResolvedValue(makeExpense({ id: "e_billed", invoiceLineId: "il_1" }));

      try {
        await caller.delete({ id: "e_billed" });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
        expect(err.message).toContain("billed");
      }
    });

    it("throws NOT_FOUND when expense does not exist", async () => {
      ctx.db.expense.findUnique.mockResolvedValue(null);

      try {
        await caller.delete({ id: "e_ghost" });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
      }
    });
  });

  // ───────── deleteMany ─────────
  describe("deleteMany", () => {
    it("deletes multiple unbilled expenses", async () => {
      ctx.db.expense.findMany.mockResolvedValue([{ id: "e_1" }, { id: "e_2" }]);
      ctx.db.expense.deleteMany.mockResolvedValue({ count: 2 });

      const result = await caller.deleteMany({ ids: ["e_1", "e_2"] });

      expect(result.count).toBe(2);
      expect(ctx.db.expense.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["e_1", "e_2"] },
          organizationId: "test-org-123",
          invoiceLineId: null,
        },
        select: { id: true },
      });
      expect(ctx.db.expense.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["e_1", "e_2"] }, organizationId: "test-org-123" },
      });
    });

    it("skips billed expenses and only deletes unbilled ones", async () => {
      // Only e_1 is unbilled; e_2 is billed and not returned by findMany
      ctx.db.expense.findMany.mockResolvedValue([{ id: "e_1" }]);
      ctx.db.expense.deleteMany.mockResolvedValue({ count: 1 });

      const result = await caller.deleteMany({ ids: ["e_1", "e_2"] });

      expect(result.count).toBe(1);
      expect(ctx.db.expense.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["e_1"] }, organizationId: "test-org-123" },
      });
    });

    it("returns count 0 when all expenses are billed", async () => {
      ctx.db.expense.findMany.mockResolvedValue([]);

      const result = await caller.deleteMany({ ids: ["e_billed_1", "e_billed_2"] });

      expect(result).toEqual({ count: 0 });
      expect(ctx.db.expense.deleteMany).not.toHaveBeenCalled();
    });

    it("scopes to organization", async () => {
      ctx.db.expense.findMany.mockResolvedValue([{ id: "e_1" }]);
      ctx.db.expense.deleteMany.mockResolvedValue({ count: 1 });

      await caller.deleteMany({ ids: ["e_1"] });

      expect(ctx.db.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: "test-org-123" }),
        }),
      );
    });
  });

  // ───────── categorizeMany ─────────
  describe("categorizeMany", () => {
    it("assigns a category to multiple expenses", async () => {
      ctx.db.expense.updateMany.mockResolvedValue({ count: 3 });

      const result = await caller.categorizeMany({
        ids: ["e_1", "e_2", "e_3"],
        categoryId: "cat_office",
      });

      expect(result.count).toBe(3);
      expect(ctx.db.expense.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["e_1", "e_2", "e_3"] },
          organizationId: "test-org-123",
        },
        data: { categoryId: "cat_office" },
      });
    });

    it("clears category when categoryId is null", async () => {
      ctx.db.expense.updateMany.mockResolvedValue({ count: 2 });

      const result = await caller.categorizeMany({
        ids: ["e_1", "e_2"],
        categoryId: null,
      });

      expect(result.count).toBe(2);
      expect(ctx.db.expense.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["e_1", "e_2"] },
          organizationId: "test-org-123",
        },
        data: { categoryId: null },
      });
    });

    it("scopes updateMany to organization", async () => {
      ctx.db.expense.updateMany.mockResolvedValue({ count: 1 });

      await caller.categorizeMany({ ids: ["e_1"], categoryId: "cat_1" });

      expect(ctx.db.expense.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: "test-org-123" }),
        }),
      );
    });
  });

  // ───────── generateRecurring ─────────
  describe("generateRecurring", () => {
    it("returns success after generating recurring expenses", async () => {
      ctx.db.recurringExpense.findMany.mockResolvedValue([]);

      const result = await caller.generateRecurring();

      expect(result).toEqual({ success: true });
    });

    it("calls findMany for due recurring expenses scoped to org", async () => {
      ctx.db.recurringExpense.findMany.mockResolvedValue([]);

      await caller.generateRecurring();

      expect(ctx.db.recurringExpense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
            isActive: true,
            nextRunAt: expect.objectContaining({ lte: expect.any(Date) }),
          }),
        }),
      );
    });

    it("still succeeds even when a recurring record throws", async () => {
      const { generateExpensesForRecurring } = await import("@/server/services/recurring-expense-generator");
      (generateExpensesForRecurring as any).mockRejectedValueOnce(new Error("DB error"));

      ctx.db.recurringExpense.findMany.mockResolvedValue([
        { id: "rec_1", organizationId: "test-org-123", isActive: true },
      ]);

      const result = await caller.generateRecurring();

      expect(result).toEqual({ success: true });
    });
  });

  // ───────── billToInvoice ─────────
  describe("billToInvoice", () => {
    const mockInvoice = {
      id: "inv_1",
      organizationId: "test-org-123",
      lines: [{ id: "line_existing", sort: 0 }],
    };

    beforeEach(() => {
      // Reset mocks specific to billToInvoice
      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.invoiceLine.create.mockResolvedValue({ id: "line_new", sort: 1 });
      ctx.db.invoiceLine.findMany.mockResolvedValue([]);
      ctx.db.invoice.update.mockResolvedValue({ id: "inv_1", total: 220 });
    });

    it("creates invoice lines from unbilled expenses", async () => {
      ctx.db.expense.findMany.mockResolvedValue([
        makeExpense({ id: "e_1", name: "Expense 1", qty: 2, rate: new Decimal("50"), tax: null }),
      ]);

      const result = await caller.billToInvoice({
        invoiceId: "inv_1",
        expenseIds: ["e_1"],
      });

      expect(result).toBeDefined();
      expect(ctx.db.invoiceLine.create).toHaveBeenCalled();
      expect(ctx.db.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "e_1" },
          data: { invoiceLineId: "line_new" },
        }),
      );
    });

    it("throws NOT_FOUND when invoice does not exist", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue(null);

      try {
        await caller.billToInvoice({ invoiceId: "inv_missing", expenseIds: ["e_1"] });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("NOT_FOUND");
        expect(err.message).toContain("Invoice");
      }
    });

    it("throws BAD_REQUEST when no unbilled expenses found", async () => {
      ctx.db.expense.findMany.mockResolvedValue([]);

      try {
        await caller.billToInvoice({ invoiceId: "inv_1", expenseIds: ["e_billed"] });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
        expect(err.message).toContain("unbilled");
      }
    });

    it("recalculates invoice totals after billing expenses", async () => {
      ctx.db.expense.findMany.mockResolvedValue([
        makeExpense({ id: "e_1", name: "Expense 1", qty: 1, rate: new Decimal("100"), tax: null }),
      ]);

      await caller.billToInvoice({ invoiceId: "inv_1", expenseIds: ["e_1"] });

      expect(ctx.db.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inv_1" },
          data: expect.objectContaining({
            subtotal: expect.any(Number),
            taxTotal: expect.any(Number),
            total: expect.any(Number),
          }),
        }),
      );
    });

    it("creates lines with correct sort order after existing lines", async () => {
      ctx.db.expense.findMany.mockResolvedValue([
        makeExpense({ id: "e_1", name: "First", qty: 1, rate: new Decimal("50"), tax: null }),
        makeExpense({ id: "e_2", name: "Second", qty: 1, rate: new Decimal("75"), tax: null }),
      ]);
      ctx.db.invoiceLine.create.mockImplementation(async (args: any) => ({
        id: `line_${args.data.sort}`,
        sort: args.data.sort,
      }));

      await caller.billToInvoice({ invoiceId: "inv_1", expenseIds: ["e_1", "e_2"] });

      const calls = ctx.db.invoiceLine.create.mock.calls;
      // mockInvoice.lines has 1 existing line, so new lines start at sort=1
      expect(calls[0][0].data.sort).toBe(1);
      expect(calls[1][0].data.sort).toBe(2);
    });

    it("bills expenses with tax breakdown", async () => {
      const { calculateLineTotals } = await import("@/server/services/tax-calculator");
      (calculateLineTotals as any).mockReturnValue({
        subtotal: 100,
        taxTotal: 13,
        total: 113,
        taxBreakdown: [{ taxId: "tax_hst", taxAmount: 13 }],
      });

      ctx.db.expense.findMany.mockResolvedValue([
        makeExpense({
          id: "e_taxed",
          name: "Taxed Expense",
          qty: 1,
          rate: new Decimal("100"),
          tax: { id: "tax_hst", rate: new Decimal("0.13"), isCompound: false, name: "HST" },
        }),
      ]);

      await caller.billToInvoice({ invoiceId: "inv_1", expenseIds: ["e_taxed"] });

      expect(ctx.db.invoiceLine.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lineType: "EXPENSE",
            taxes: {
              create: [{ taxId: "tax_hst", taxAmount: 13 }],
            },
          }),
        }),
      );
    });

    it("marks each expense as billed with the created line id", async () => {
      ctx.db.expense.findMany.mockResolvedValue([
        makeExpense({ id: "e_a", name: "A", qty: 1, rate: new Decimal("10"), tax: null }),
        makeExpense({ id: "e_b", name: "B", qty: 1, rate: new Decimal("20"), tax: null }),
      ]);
      ctx.db.invoiceLine.create
        .mockResolvedValueOnce({ id: "line_a", sort: 1 })
        .mockResolvedValueOnce({ id: "line_b", sort: 2 });

      await caller.billToInvoice({ invoiceId: "inv_1", expenseIds: ["e_a", "e_b"] });

      expect(ctx.db.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "e_a" }, data: { invoiceLineId: "line_a" } }),
      );
      expect(ctx.db.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "e_b" }, data: { invoiceLineId: "line_b" } }),
      );
    });
  });
});
