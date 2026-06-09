import { describe, it, expect, beforeEach } from "vitest";
import { invoiceReviewRouter } from "@/server/routers/invoiceReview";
import { createMockContext } from "./mocks/trpc-context";
import { TRPCError } from "@trpc/server";

describe("invoiceReview.review — multi-tenant isolation", () => {
  let ctx: ReturnType<typeof createMockContext>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext(); // orgId: "test-org-123", role OWNER
    caller = invoiceReviewRouter.createCaller(ctx);
  });

  it("scopes the invoice lookup to the caller's org", async () => {
    // Another org's invoice is invisible — findFirst returns null
    ctx.db.invoice.findFirst.mockResolvedValue(null);

    await expect(caller.review({ invoiceId: "other-org-invoice" })).rejects.toThrow(TRPCError);

    const where = ctx.db.invoice.findFirst.mock.calls[0][0].where;
    expect(where.organizationId).toBe("test-org-123");
    expect(where.id).toBe("other-org-invoice");
  });

  it("scopes the duplicate-detection and unbilled-time queries to the caller's org", async () => {
    ctx.db.invoice.findFirst.mockResolvedValue({
      id: "inv1",
      organizationId: "test-org-123",
      total: 100,
      discountTotal: 0,
      clientId: "c1",
      client: {
        id: "c1",
        name: "Acme",
        address: "1 St",
        city: "Town",
        country: "US",
        taxId: "T1",
        isTaxExempt: false,
      },
      lines: [],
      organization: { stripeTaxEnabled: false },
    });
    ctx.db.invoice.findMany.mockResolvedValue([]);
    ctx.db.timeEntry.aggregate.mockResolvedValue({ _sum: { minutes: null } });

    await caller.review({ invoiceId: "inv1" });

    expect(ctx.db.invoice.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
    expect(ctx.db.timeEntry.aggregate.mock.calls[0][0].where.organizationId).toBe("test-org-123");
  });
});
