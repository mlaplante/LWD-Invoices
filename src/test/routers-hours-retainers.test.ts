import { describe, it, expect, beforeEach } from "vitest";
import { hoursRetainersRouter } from "@/server/routers/hoursRetainers";
import { createMockContext } from "./mocks/trpc-context";
import { TRPCError } from "@trpc/server";

describe("hoursRetainers.list", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = hoursRetainersRouter.createCaller(ctx);
  });

  it("returns retainers scoped to org + client", async () => {
    const retainers = [
      { id: "hr_1", name: "Block 20", organizationId: "test-org-123", clientId: "client_1", periods: [] },
    ];
    ctx.db.hoursRetainer.findMany.mockResolvedValue(retainers);

    const out = await caller.list({ clientId: "client_1" });

    expect(out).toEqual(retainers);
    expect(ctx.db.hoursRetainer.findMany).toHaveBeenCalledWith({
      where: { organizationId: "test-org-123", clientId: "client_1" },
      include: { periods: { orderBy: { periodStart: "desc" } } },
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns empty array when no retainers exist", async () => {
    ctx.db.hoursRetainer.findMany.mockResolvedValue([]);
    const out = await caller.list({ clientId: "client_1" });
    expect(out).toEqual([]);
  });

  it("scopes queries to the caller's orgId (multi-tenant isolation)", async () => {
    ctx.db.hoursRetainer.findMany.mockResolvedValue([]);
    await caller.list({ clientId: "client_x" });
    const call = ctx.db.hoursRetainer.findMany.mock.calls[0][0];
    expect(call.where.organizationId).toBe("test-org-123");
  });
});

describe("hoursRetainers.getDetail", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = hoursRetainersRouter.createCaller(ctx);
  });

  it("returns retainer with nested client/periods/timeEntries when found", async () => {
    const retainer = {
      id: "hr_1",
      name: "Monthly 20",
      organizationId: "test-org-123",
      client: { id: "client_1", name: "Acme" },
      periods: [],
      timeEntries: [],
    };
    ctx.db.hoursRetainer.findFirst.mockResolvedValue(retainer);

    const out = await caller.getDetail({ id: "hr_1" });
    expect(out).toEqual(retainer);

    const where = ctx.db.hoursRetainer.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ id: "hr_1", organizationId: "test-org-123" });
  });

  it("throws NOT_FOUND when retainer does not exist", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue(null);
    await expect(caller.getDetail({ id: "missing" })).rejects.toThrow(TRPCError);
    await expect(caller.getDetail({ id: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND when retainer belongs to another org (simulated by returning null)", async () => {
    // The router's findFirst with organizationId filter handles this; we simulate by returning null.
    ctx.db.hoursRetainer.findFirst.mockResolvedValue(null);
    await expect(caller.getDetail({ id: "hr_other_org" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
