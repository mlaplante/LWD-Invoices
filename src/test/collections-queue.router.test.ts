import { describe, it, expect, beforeEach } from "vitest";
import { collectionsRouter } from "@/server/routers/collections";
import { createMockContext } from "./mocks/trpc-context";

describe("collections.queue — multi-tenant isolation", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext(); // orgId: "test-org-123", role OWNER
    caller = collectionsRouter.createCaller(ctx);
    ctx.db.organization.findUnique.mockResolvedValue({ smartRemindersThreshold: 80 });
    ctx.db.invoice.findMany.mockResolvedValue([]);
  });

  it("loads open invoices and org settings scoped to the caller's org", async () => {
    const out = await caller.queue({ limit: 50 });
    expect(out.queue).toEqual([]);
    expect(ctx.db.invoice.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
    expect(ctx.db.organization.findUnique.mock.calls[0][0].where.id).toBe("test-org-123");
  });
});
