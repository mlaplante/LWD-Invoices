import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

// ============================================================
// Task 9: create
// ============================================================
describe("hoursRetainers.create", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = hoursRetainersRouter.createCaller(ctx);
    ctx.db.user.findFirst.mockResolvedValue(null);
  });

  it("creates a BLOCK retainer without opening a period", async () => {
    const createdRetainer = {
      id: "hr_block_1",
      organizationId: "test-org-123",
      clientId: "client_1",
      name: "Block 20h",
      includedHours: 20,
      resetInterval: null,
      active: true,
    };
    ctx.db.client.findFirst.mockResolvedValue({ id: "client_1" });
    ctx.db.hoursRetainer.create.mockResolvedValue(createdRetainer);

    const out = await caller.create({
      clientId: "client_1",
      name: "Block 20h",
      type: "BLOCK",
      includedHours: 20,
      active: true,
    });

    expect(out).toEqual(createdRetainer);
    expect(ctx.db.hoursRetainer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ resetInterval: null }),
    });
    expect(ctx.db.hoursRetainerPeriod.create).not.toHaveBeenCalled();
  });

  it("creates a MONTHLY retainer and auto-opens first period", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));

    const createdRetainer = {
      id: "hr_monthly_1",
      organizationId: "test-org-123",
      clientId: "client_1",
      name: "Monthly 20h",
      includedHours: 20,
      resetInterval: "MONTHLY",
      active: true,
    };
    const createdPeriod = {
      id: "p_1",
      retainerId: "hr_monthly_1",
      label: "April 2026",
      periodStart: new Date("2026-04-01T00:00:00.000Z"),
      periodEnd: new Date("2026-04-30T23:59:59.999Z"),
      includedHoursSnapshot: 20,
      status: "ACTIVE",
    };
    ctx.db.client.findFirst.mockResolvedValue({ id: "client_1" });
    ctx.db.hoursRetainer.create.mockResolvedValue(createdRetainer);
    ctx.db.hoursRetainerPeriod.create.mockResolvedValue(createdPeriod);

    const out = await caller.create({
      clientId: "client_1",
      name: "Monthly 20h",
      type: "MONTHLY",
      includedHours: 20,
      active: true,
    });

    expect(out).toEqual(createdRetainer);
    expect(ctx.db.hoursRetainer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ resetInterval: "MONTHLY" }),
    });
    expect(ctx.db.hoursRetainerPeriod.create).toHaveBeenCalledOnce();
    const periodData = ctx.db.hoursRetainerPeriod.create.mock.calls[0][0].data;
    expect(periodData.label).toBe("April 2026");
    expect(periodData.periodStart).toEqual(new Date("2026-04-01T00:00:00.000Z"));
    expect(periodData.periodEnd).toEqual(new Date("2026-04-30T23:59:59.999Z"));
    expect(periodData.includedHoursSnapshot).toBe(20);
    expect(periodData.status).toBe("ACTIVE");

    vi.useRealTimers();
  });

  it("throws NOT_FOUND when client does not exist or belongs to another org", async () => {
    ctx.db.client.findFirst.mockResolvedValue(null);

    await expect(
      caller.create({
        clientId: "nonexistent",
        name: "Test",
        type: "BLOCK",
        includedHours: 10,
        active: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(ctx.db.hoursRetainer.create).not.toHaveBeenCalled();
  });
});
