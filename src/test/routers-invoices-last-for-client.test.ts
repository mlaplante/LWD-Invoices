import { describe, it, expect, beforeEach } from "vitest";
import { invoicesRouter } from "@/server/routers/invoices";
import { createMockContext } from "./mocks/trpc-context";

describe("invoices.lastForClient", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof invoicesRouter.createCaller>;
  beforeEach(() => {
    ctx = createMockContext();
    caller = invoicesRouter.createCaller(ctx);
  });

  it("returns the client's most recent invoice's copyable fields, org-scoped", async () => {
    ctx.db.invoice.findFirst.mockResolvedValue({
      id: "inv_9",
      type: "DETAILED",
      currencyId: "cur_1",
      notes: "Net 30",
      lines: [
        {
          sort: 0,
          lineType: "STANDARD",
          name: "Design",
          description: "UI design work",
          qty: 2,
          rate: 50,
          period: null,
          discount: 0,
          discountIsPercentage: false,
          taxes: [{ taxId: "t1" }],
        },
      ],
    });

    const result = await caller.lastForClient({ clientId: "c1" });

    expect(ctx.db.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "test-org-123", clientId: "c1" },
        orderBy: { date: "desc" },
      }),
    );
    expect(result).toMatchObject({
      type: "DETAILED",
      currencyId: "cur_1",
      notes: "Net 30",
      lines: [
        {
          sort: 0,
          lineType: "STANDARD",
          name: "Design",
          qty: 2,
          rate: 50,
          discount: 0,
          discountIsPercentage: false,
          taxIds: ["t1"],
        },
      ],
    });
  });

  it("returns null when the client has no invoices", async () => {
    ctx.db.invoice.findFirst.mockResolvedValue(null);
    expect(await caller.lastForClient({ clientId: "c1" })).toBeNull();
  });
});
