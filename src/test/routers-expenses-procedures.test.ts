import { describe, it, expect, beforeEach } from "vitest";
import { expensesRouter } from "@/server/routers/expenses";
import { createMockContext } from "./mocks/trpc-context";
import { Decimal } from "@prisma/client-runtime-utils";

describe("Expenses Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = expensesRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns all expenses for organization", async () => {
      ctx.db.expense.findMany.mockResolvedValue([
        {
          id: "e_1",
          name: "Office Supplies",
          description: "Monthly supplies",
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
          categoryId: "cat_1",
          supplierId: "sup_1",
          createdAt: new Date(),
          updatedAt: new Date(),
          tax: null,
          category: { id: "cat_1", name: "Office", organizationId: "test-org-123", createdAt: new Date(), updatedAt: new Date() },
          supplier: { id: "sup_1", name: "Staples", organizationId: "test-org-123", createdAt: new Date(), updatedAt: new Date() },
          project: null,
        },
      ]);

      const result = await caller.list({});

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Office Supplies");
      expect(ctx.db.expense.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "test-org-123",
        },
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
        {
          id: "e_2",
          name: "Project Expense",
          description: "Related to project",
          qty: 2,
          rate: new Decimal("250"),
          organizationId: "test-org-123",
          projectId: "p_1",
          dueDate: null,
          paidAt: null,
          reimbursable: false,
          paymentDetails: null,
          receiptUrl: null,
          invoiceLineId: null,
          taxId: null,
          categoryId: null,
          supplierId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          tax: null,
          category: null,
          supplier: null,
          project: { id: "p_1", name: "Test Project" },
        },
      ]);

      const result = await caller.list({ projectId: "p_1" });

      expect(result).toHaveLength(1);
      expect(result[0].projectId).toBe("p_1");
      expect(ctx.db.expense.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "test-org-123",
          projectId: "p_1",
        },
        include: expect.any(Object),
        orderBy: { createdAt: "desc" },
      });
    });

    it("filters unbilled expenses only", async () => {
      ctx.db.expense.findMany.mockResolvedValue([
        {
          id: "e_3",
          name: "Unbilled Expense",
          description: null,
          qty: 1,
          rate: new Decimal("75"),
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
          createdAt: new Date(),
          updatedAt: new Date(),
          tax: null,
          category: null,
          supplier: null,
          project: null,
        },
      ]);

      const result = await caller.list({ unbilledOnly: true });

      expect(result).toHaveLength(1);
      expect(result[0].invoiceLineId).toBeNull();
      expect(ctx.db.expense.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "test-org-123",
          invoiceLineId: null,
        },
        include: expect.any(Object),
        orderBy: { createdAt: "desc" },
      });
    });
  });

  describe("getById", () => {
    it("returns expense with all relations", async () => {
      ctx.db.expense.findUnique.mockResolvedValue({
        id: "e_1",
        name: "Detailed Expense",
        description: "Full expense details",
        qty: 3,
        rate: new Decimal("150"),
        organizationId: "test-org-123",
        projectId: "p_1",
        dueDate: new Date("2026-03-31"),
        paidAt: new Date("2026-02-26"),
        reimbursable: true,
        paymentDetails: "Direct deposit",
        receiptUrl: "https://example.com/receipt.pdf",
        invoiceLineId: null,
        taxId: "tax_1",
        categoryId: "cat_1",
        supplierId: "sup_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        tax: {
          id: "tax_1",
          rate: new Decimal("0.1"),
          isCompound: false,
          name: "VAT",
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        category: {
          id: "cat_1",
          name: "Equipment",
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        supplier: {
          id: "sup_1",
          name: "Tech Supplier",
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        project: { id: "p_1", name: "Main Project" },
      });

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
  });

  describe("create", () => {
    it("creates expense with required fields only", async () => {
      ctx.db.expense.create.mockResolvedValue({
        id: "e_new",
        name: "New Expense",
        description: null,
        qty: 1,
        rate: new Decimal("50"),
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
        createdAt: new Date(),
        updatedAt: new Date(),
        tax: null,
        category: null,
        supplier: null,
        project: null,
      });

      const result = await caller.create({
        name: "New Expense",
        rate: 50,
      });

      expect(result.id).toBe("e_new");
      expect(result.name).toBe("New Expense");
      expect(result.qty).toBe(1);
      expect(ctx.db.expense.create).toHaveBeenCalled();
    });

    it("creates expense with all optional fields", async () => {
      ctx.db.expense.create.mockResolvedValue({
        id: "e_full",
        name: "Full Expense",
        description: "Complete expense record",
        qty: 5,
        rate: new Decimal("200"),
        organizationId: "test-org-123",
        projectId: "p_1",
        dueDate: new Date("2026-03-31"),
        paidAt: new Date("2026-02-26"),
        reimbursable: true,
        paymentDetails: "Paid by credit card",
        receiptUrl: "https://example.com/receipt.jpg",
        invoiceLineId: null,
        taxId: "tax_1",
        categoryId: "cat_1",
        supplierId: "sup_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        tax: null,
        category: null,
        supplier: null,
        project: null,
      });

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
      ctx.db.expense.create.mockResolvedValue({
        id: "e_default",
        name: "Default Qty Expense",
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
        createdAt: new Date(),
        updatedAt: new Date(),
        tax: null,
        category: null,
        supplier: null,
        project: null,
      });

      const result = await caller.create({
        name: "Default Qty Expense",
        rate: 100,
      });

      expect(result.qty).toBe(1);
    });
  });

  describe("update", () => {
    it("updates expense with all fields", async () => {
      ctx.db.expense.findUnique.mockResolvedValue({
        id: "e_1",
        organizationId: "test-org-123",
      });

      ctx.db.expense.update.mockResolvedValue({
        id: "e_1",
        name: "Updated Expense",
        description: "Updated description",
        qty: 10,
        rate: new Decimal("300"),
        organizationId: "test-org-123",
        projectId: "p_2",
        dueDate: new Date("2026-04-30"),
        paidAt: new Date("2026-02-27"),
        reimbursable: true,
        paymentDetails: "Updated payment details",
        receiptUrl: "https://example.com/new-receipt.pdf",
        invoiceLineId: null,
        taxId: "tax_2",
        categoryId: "cat_2",
        supplierId: "sup_2",
        createdAt: new Date(),
        updatedAt: new Date(),
        tax: null,
        category: null,
        supplier: null,
        project: null,
      });

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
      ctx.db.expense.findUnique.mockResolvedValue({
        id: "e_1",
        organizationId: "test-org-123",
      });

      ctx.db.expense.update.mockResolvedValue({
        id: "e_1",
        name: "Partial Update",
        description: null,
        qty: 1,
        rate: new Decimal("50"),
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
        createdAt: new Date(),
        updatedAt: new Date(),
        tax: null,
        category: null,
        supplier: null,
        project: null,
      });

      const result = await caller.update({
        id: "e_1",
        name: "Partial Update",
      });

      expect(result.name).toBe("Partial Update");
      expect(ctx.db.expense.update).toHaveBeenCalledWith({
        where: { id: "e_1", organizationId: "test-org-123" },
        data: { name: "Partial Update" },
        include: expect.any(Object),
      });
    });
  });

  describe("delete", () => {
    it("deletes unbilled expense", async () => {
      ctx.db.expense.findUnique.mockResolvedValue({
        id: "e_1",
        organizationId: "test-org-123",
        invoiceLineId: null,
      });

      ctx.db.expense.delete.mockResolvedValue({
        id: "e_1",
        name: "Deleted Expense",
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
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.delete({ id: "e_1" });

      expect(result.id).toBe("e_1");
      expect(ctx.db.expense.delete).toHaveBeenCalledWith({
        where: { id: "e_1", organizationId: "test-org-123" },
      });
    });

    it("prevents deleting billed expense", async () => {
      ctx.db.expense.findUnique.mockResolvedValue({
        id: "e_billed",
        organizationId: "test-org-123",
        invoiceLineId: "il_1",
      });

      try {
        await caller.delete({ id: "e_billed" });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.code).toBe("BAD_REQUEST");
        expect(err.message).toContain("billed");
      }
    });
  });
});
