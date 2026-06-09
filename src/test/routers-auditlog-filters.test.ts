import { describe, it, expect, beforeEach } from "vitest";
import { auditLogRouter } from "@/server/routers/auditLog";
import { createMockContext } from "./mocks/trpc-context";

describe("auditLog.list filters", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof auditLogRouter.createCaller>;
  beforeEach(() => {
    ctx = createMockContext();
    caller = auditLogRouter.createCaller(ctx);
    ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
    ctx.db.auditLog.findMany.mockResolvedValue([]);
  });

  it("filters by multiple entity types, action, and date range", async () => {
    await caller.list({
      entityTypes: ["Invoice", "Project"],
      action: "CREATED",
      from: new Date("2026-06-01"),
      to: new Date("2026-06-30"),
    });
    const arg = ctx.db.auditLog.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      organizationId: "test-org-123",
      entityType: { in: ["Invoice", "Project"] },
      action: "CREATED",
    });
    expect(arg.where.createdAt).toMatchObject({ gte: new Date("2026-06-01"), lte: new Date("2026-06-30") });
  });

  it("omits filters that are not provided", async () => {
    await caller.list({});
    const arg = ctx.db.auditLog.findMany.mock.calls[0][0];
    expect(arg.where.entityType).toBeUndefined();
    expect(arg.where.action).toBeUndefined();
    expect(arg.where.createdAt).toBeUndefined();
  });
});
