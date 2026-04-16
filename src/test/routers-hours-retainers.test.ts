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

// ============================================================
// Task 10: update
// ============================================================
describe("hoursRetainers.update", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = hoursRetainersRouter.createCaller(ctx);
    ctx.db.user.findFirst.mockResolvedValue(null);
  });

  it("updates fields correctly", async () => {
    const existing = { id: "hr_1" };
    const updated = { id: "hr_1", name: "Renamed", includedHours: 30, active: false };
    ctx.db.hoursRetainer.findFirst.mockResolvedValue(existing);
    ctx.db.hoursRetainer.update.mockResolvedValue(updated);

    const out = await caller.update({ id: "hr_1", name: "Renamed", includedHours: 30, active: false });

    expect(out).toEqual(updated);
    expect(ctx.db.hoursRetainer.update).toHaveBeenCalledWith({
      where: { id: "hr_1" },
      data: { name: "Renamed", includedHours: 30, active: false },
    });
  });

  it("throws NOT_FOUND when retainer belongs to another org", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue(null);

    await expect(caller.update({ id: "hr_1", name: "New Name" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("does NOT touch hoursRetainerPeriod.update (no retroactive snapshot change)", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue({ id: "hr_1" });
    ctx.db.hoursRetainer.update.mockResolvedValue({ id: "hr_1" });

    await caller.update({ id: "hr_1", includedHours: 25 });

    expect(ctx.db.hoursRetainerPeriod.update).not.toHaveBeenCalled();
  });
});

// ============================================================
// Task 11: delete
// ============================================================
describe("hoursRetainers.delete", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = hoursRetainersRouter.createCaller(ctx);
    ctx.db.user.findFirst.mockResolvedValue(null);
  });

  it("deletes when there are no time entries", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue({ id: "hr_1" });
    ctx.db.timeEntry.count.mockResolvedValue(0);
    ctx.db.hoursRetainer.delete.mockResolvedValue({ id: "hr_1" });

    const out = await caller.delete({ id: "hr_1" });
    expect(out).toEqual({ ok: true });
    expect(ctx.db.hoursRetainer.delete).toHaveBeenCalledWith({ where: { id: "hr_1" } });
  });

  it("throws BAD_REQUEST with 'time entries' in message when count > 0", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue({ id: "hr_1" });
    ctx.db.timeEntry.count.mockResolvedValue(3);

    await expect(caller.delete({ id: "hr_1" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.delete({ id: "hr_1" })).rejects.toThrow(/time entries/i);
  });

  it("throws NOT_FOUND when retainer is missing or wrong org", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue(null);

    await expect(caller.delete({ id: "hr_1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does NOT call hoursRetainer.delete when guard fails", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue({ id: "hr_1" });
    ctx.db.timeEntry.count.mockResolvedValue(5);

    await expect(caller.delete({ id: "hr_1" })).rejects.toThrow();
    expect(ctx.db.hoursRetainer.delete).not.toHaveBeenCalled();
  });
});

// ============================================================
// Task 12: openPeriod
// ============================================================
describe("hoursRetainers.openPeriod", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = hoursRetainersRouter.createCaller(ctx);
    ctx.db.user.findFirst.mockResolvedValue(null);
  });

  it("opens a period on a MONTHLY retainer with correct snapshot and ACTIVE status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));

    const retainer = { id: "hr_1", resetInterval: "MONTHLY", includedHours: 20 };
    const createdPeriod = { id: "p_1", status: "ACTIVE" };
    ctx.db.hoursRetainer.findFirst.mockResolvedValue(retainer);
    ctx.db.hoursRetainerPeriod.findFirst.mockResolvedValue(null);
    ctx.db.hoursRetainerPeriod.create.mockResolvedValue(createdPeriod);

    const out = await caller.openPeriod({ retainerId: "hr_1" });

    expect(out).toEqual(createdPeriod);
    const data = ctx.db.hoursRetainerPeriod.create.mock.calls[0][0].data;
    expect(data.status).toBe("ACTIVE");
    expect(data.includedHoursSnapshot).toBe(20);
    expect(data.retainerId).toBe("hr_1");

    vi.useRealTimers();
  });

  it("throws BAD_REQUEST 'block' when retainer has resetInterval: null", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue({ id: "hr_1", resetInterval: null, includedHours: 20 });

    await expect(caller.openPeriod({ retainerId: "hr_1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(caller.openPeriod({ retainerId: "hr_1" })).rejects.toThrow(/block/i);
  });

  it("throws NOT_FOUND when retainer is missing or wrong org", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue(null);

    await expect(caller.openPeriod({ retainerId: "hr_missing" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("respects input overrides for label, periodStart, periodEnd", async () => {
    const retainer = { id: "hr_1", resetInterval: "MONTHLY", includedHours: 15 };
    ctx.db.hoursRetainer.findFirst.mockResolvedValue(retainer);
    ctx.db.hoursRetainerPeriod.findFirst.mockResolvedValue(null);
    ctx.db.hoursRetainerPeriod.create.mockResolvedValue({ id: "p_2" });

    const customStart = new Date("2026-03-01T00:00:00.000Z");
    const customEnd = new Date("2026-03-31T23:59:59.999Z");

    await caller.openPeriod({
      retainerId: "hr_1",
      label: "March 2026 (custom)",
      periodStart: customStart,
      periodEnd: customEnd,
    });

    const data = ctx.db.hoursRetainerPeriod.create.mock.calls[0][0].data;
    expect(data.label).toBe("March 2026 (custom)");
    expect(data.periodStart).toEqual(customStart);
    expect(data.periodEnd).toEqual(customEnd);
  });

  it("throws BAD_REQUEST when an active period already exists", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue({
      id: "hr_1",
      organizationId: "test-org-123",
      resetInterval: "MONTHLY",
      includedHours: "20",
    });
    ctx.db.hoursRetainerPeriod.findFirst.mockResolvedValue({ id: "p_active" });
    await expect(caller.openPeriod({ retainerId: "hr_1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringMatching(/already active/i),
    });
    expect(ctx.db.hoursRetainerPeriod.create).not.toHaveBeenCalled();
  });

  it("openPeriod rejects inverted date range", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue({
      id: "hr_1",
      organizationId: "test-org-123",
      resetInterval: "MONTHLY",
      includedHours: "20",
    });
    await expect(
      caller.openPeriod({
        retainerId: "hr_1",
        periodStart: new Date("2026-04-30"),
        periodEnd: new Date("2026-04-01"),
      }),
    ).rejects.toThrow(/periodStart must be before periodEnd/);
  });
});

// ============================================================
// Task 13: closeAndRoll
// ============================================================
describe("hoursRetainers.closeAndRoll", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = hoursRetainersRouter.createCaller(ctx);
    ctx.db.user.findFirst.mockResolvedValue(null);
  });

  it("closes the active period and opens a new one with current retainer includedHours as snapshot", async () => {
    const retainer = { id: "hr_1", resetInterval: "MONTHLY", includedHours: 25 };
    const activePeriod = {
      id: "p_1",
      retainerId: "hr_1",
      status: "ACTIVE",
      includedHoursSnapshot: 20, // old snapshot - should NOT be used for new period
      periodEnd: new Date("2026-04-30T23:59:59.999Z"),
    };
    const closedPeriod = { ...activePeriod, status: "CLOSED" };
    const openedPeriod = { id: "p_2", status: "ACTIVE", label: "May 2026" };

    ctx.db.hoursRetainer.findFirst.mockResolvedValue(retainer);
    ctx.db.hoursRetainerPeriod.findFirst.mockResolvedValue(activePeriod);
    ctx.db.hoursRetainerPeriod.update.mockResolvedValue(closedPeriod);
    ctx.db.hoursRetainerPeriod.create.mockResolvedValue(openedPeriod);

    const out = await caller.closeAndRoll({ retainerId: "hr_1" });

    expect(out.closed.status).toBe("CLOSED");
    expect(out.opened).toEqual(openedPeriod);

    // New period snapshot uses retainer's CURRENT includedHours (25), not the closed period's (20)
    const newPeriodData = ctx.db.hoursRetainerPeriod.create.mock.calls[0][0].data;
    expect(newPeriodData.includedHoursSnapshot).toBe(25);
    expect(newPeriodData.status).toBe("ACTIVE");
    // Should be May 2026 (next month after April)
    expect(newPeriodData.label).toBe("May 2026");
  });

  it("throws BAD_REQUEST 'active' when no active period exists", async () => {
    const retainer = { id: "hr_1", resetInterval: "MONTHLY", includedHours: 20 };
    ctx.db.hoursRetainer.findFirst.mockResolvedValue(retainer);
    ctx.db.hoursRetainerPeriod.findFirst.mockResolvedValue(null);

    await expect(caller.closeAndRoll({ retainerId: "hr_1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(caller.closeAndRoll({ retainerId: "hr_1" })).rejects.toThrow(/active/i);
  });

  it("throws BAD_REQUEST for a block retainer", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue({ id: "hr_1", resetInterval: null, includedHours: 20 });

    await expect(caller.closeAndRoll({ retainerId: "hr_1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("throws NOT_FOUND when retainer is missing", async () => {
    ctx.db.hoursRetainer.findFirst.mockResolvedValue(null);

    await expect(caller.closeAndRoll({ retainerId: "hr_missing" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

// ============================================================
// Task 14: editPeriod + deletePeriod
// ============================================================
describe("hoursRetainers.editPeriod", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = hoursRetainersRouter.createCaller(ctx);
    ctx.db.user.findFirst.mockResolvedValue(null);
  });

  it("updates label, dates, and snapshot correctly", async () => {
    const period = { id: "p_1", retainerId: "hr_1" };
    const updated = { id: "p_1", label: "April 2026 (adj)", includedHoursSnapshot: 22 };
    ctx.db.hoursRetainerPeriod.findFirst.mockResolvedValue(period);
    ctx.db.hoursRetainerPeriod.update.mockResolvedValue(updated);

    const newStart = new Date("2026-04-01T00:00:00.000Z");
    const newEnd = new Date("2026-04-30T23:59:59.999Z");

    const out = await caller.editPeriod({
      periodId: "p_1",
      label: "April 2026 (adj)",
      periodStart: newStart,
      periodEnd: newEnd,
      includedHoursSnapshot: 22,
    });

    expect(out).toEqual(updated);
    expect(ctx.db.hoursRetainerPeriod.update).toHaveBeenCalledWith({
      where: { id: "p_1" },
      data: {
        label: "April 2026 (adj)",
        periodStart: newStart,
        periodEnd: newEnd,
        includedHoursSnapshot: 22,
      },
    });
    const where = ctx.db.hoursRetainerPeriod.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({
      id: "p_1",
      retainer: { organizationId: "test-org-123" },
    });
  });

  it("editPeriod rejects inverted date range", async () => {
    await expect(
      caller.editPeriod({
        periodId: "p_1",
        periodStart: new Date("2026-04-30"),
        periodEnd: new Date("2026-04-01"),
      }),
    ).rejects.toThrow(/periodStart must be before periodEnd/);
  });

  it("throws NOT_FOUND when period is missing or wrong org", async () => {
    ctx.db.hoursRetainerPeriod.findFirst.mockResolvedValue(null);

    await expect(caller.editPeriod({ periodId: "p_missing", label: "X" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("hoursRetainers.deletePeriod", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = hoursRetainersRouter.createCaller(ctx);
    ctx.db.user.findFirst.mockResolvedValue(null);
  });

  it("deletes the period when there are no time entries", async () => {
    ctx.db.hoursRetainerPeriod.findFirst.mockResolvedValue({ id: "p_1" });
    ctx.db.timeEntry.count.mockResolvedValue(0);
    ctx.db.hoursRetainerPeriod.delete.mockResolvedValue({ id: "p_1" });

    const out = await caller.deletePeriod({ periodId: "p_1" });
    expect(out).toEqual({ ok: true });
    expect(ctx.db.hoursRetainerPeriod.delete).toHaveBeenCalledWith({ where: { id: "p_1" } });
    const where = ctx.db.hoursRetainerPeriod.findFirst.mock.calls[0][0].where;
    expect(where.retainer.organizationId).toBe("test-org-123");
  });

  it("throws BAD_REQUEST 'time entries' when period has time entries", async () => {
    ctx.db.hoursRetainerPeriod.findFirst.mockResolvedValue({ id: "p_1" });
    ctx.db.timeEntry.count.mockResolvedValue(2);

    await expect(caller.deletePeriod({ periodId: "p_1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(caller.deletePeriod({ periodId: "p_1" })).rejects.toThrow(/time entries/i);
  });

  it("throws NOT_FOUND when period is missing", async () => {
    ctx.db.hoursRetainerPeriod.findFirst.mockResolvedValue(null);

    await expect(caller.deletePeriod({ periodId: "p_missing" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("does NOT call hoursRetainerPeriod.delete when guard fails", async () => {
    ctx.db.hoursRetainerPeriod.findFirst.mockResolvedValue({ id: "p_1" });
    ctx.db.timeEntry.count.mockResolvedValue(1);

    await expect(caller.deletePeriod({ periodId: "p_1" })).rejects.toThrow();
    expect(ctx.db.hoursRetainerPeriod.delete).not.toHaveBeenCalled();
  });
});
