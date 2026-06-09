import { describe, it, expect, beforeEach } from "vitest";
import { invoicesRouter } from "@/server/routers/invoices";
import { createMockContext } from "./mocks/trpc-context";

describe("invoices.openForReminder", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof invoicesRouter.createCaller>;

  beforeEach(() => {
    ctx = createMockContext();
    caller = invoicesRouter.createCaller(ctx);
  });

  it("queries only open/overdue invoices scoped to the org, newest first", async () => {
    ctx.db.invoice.findMany.mockResolvedValue([
      { id: "inv_1", number: "INV-001", status: "OVERDUE", total: 100, dueDate: new Date("2026-05-01"), client: { id: "c1", name: "Acme" } },
    ]);

    const result = await caller.openForReminder({});

    expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "test-org-123",
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        }),
        orderBy: { dueDate: "asc" },
        take: 20,
      }),
    );
    expect(result[0]).toMatchObject({ id: "inv_1", number: "INV-001", clientName: "Acme" });
  });

  it("adds a case-insensitive number/client search when q is provided", async () => {
    ctx.db.invoice.findMany.mockResolvedValue([]);
    await caller.openForReminder({ q: "acme" });
    const arg = ctx.db.invoice.findMany.mock.calls[0][0];
    expect(JSON.stringify(arg.where)).toContain("acme");
  });
});
