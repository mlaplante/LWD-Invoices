import { describe, it, expect, beforeEach } from "vitest";
import { expensesRouter } from "@/server/routers/expenses";
import { createMockContext } from "./mocks/trpc-context";

describe("expenses.suggestCategorization — multi-tenant isolation", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext(); // orgId: "test-org-123", role OWNER
    caller = expensesRouter.createCaller(ctx);
    ctx.db.expense.findMany.mockResolvedValue([]);
    ctx.db.expenseCategory.findMany.mockResolvedValue([]);
  });

  it("loads history and categories scoped to the caller's org", async () => {
    await caller.suggestCategorization({
      supplierId: "s1",
      supplierName: "AWS",
      expenseName: "Hosting",
      description: null,
    });
    expect(ctx.db.expense.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
    expect(ctx.db.expenseCategory.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
  });
});
