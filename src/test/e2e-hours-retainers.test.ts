import { describe, it, expect, beforeEach, vi } from "vitest";
import { hoursRetainersRouter } from "@/server/routers/hoursRetainers";
import { portalRouter } from "@/server/routers/portal";
import { timeEntriesRouter } from "@/server/routers/timeEntries";
import { createMockContext } from "./mocks/trpc-context";
import { Prisma } from "@/generated/prisma";

describe("E2E: hours retainer full flow (mock-based)", () => {
  it("admin creates → logs time → rolls → portal reflects the state", async () => {
    const ctx = createMockContext();
    const adminCaller = hoursRetainersRouter.createCaller(ctx);
    const teCaller = timeEntriesRouter.createCaller(ctx);
    const portalCaller = portalRouter.createCaller(ctx);

    const CLIENT_ID = "client_acme";
    const RETAINER_ID = "hr_1";
    const ACTIVE_PERIOD_ID = "p_active";
    const NEW_ACTIVE_PERIOD_ID = "p_new_active";

    // Step 1: Admin creates monthly retainer (auto-opens period)
    ctx.db.client.findFirst.mockResolvedValue({ id: CLIENT_ID });
    ctx.db.hoursRetainer.create.mockResolvedValue({
      id: RETAINER_ID,
      clientId: CLIENT_ID,
      organizationId: "test-org-123",
      name: "Monthly 20",
      includedHours: new Prisma.Decimal(20),
      resetInterval: "MONTHLY",
      active: true,
    });
    ctx.db.hoursRetainerPeriod.create.mockResolvedValue({
      id: ACTIVE_PERIOD_ID,
      retainerId: RETAINER_ID,
      status: "ACTIVE",
      includedHoursSnapshot: new Prisma.Decimal(20),
    });

    const created = await adminCaller.create({
      clientId: CLIENT_ID,
      name: "Monthly 20",
      type: "MONTHLY",
      includedHours: 20,
    });
    expect(created.id).toBe(RETAINER_ID);

    // Step 2: Admin logs 5 hours (300 minutes)
    ctx.db.organization.findFirst.mockResolvedValue({ taskTimeInterval: 0 });
    ctx.db.hoursRetainer.findFirst.mockResolvedValue({
      id: RETAINER_ID,
      organizationId: "test-org-123",
      resetInterval: "MONTHLY",
    });
    ctx.db.hoursRetainerPeriod.findFirst.mockResolvedValue({ id: ACTIVE_PERIOD_ID });
    ctx.db.timeEntry.create.mockImplementation(async ({ data }: any) => ({
      id: "te_1",
      ...data,
    }));

    const te = await teCaller.create({
      retainerId: RETAINER_ID,
      minutes: 300,
      note: "admin-only-note",
    });
    expect(te.retainerId).toBe(RETAINER_ID);
    expect(te.retainerPeriodId).toBe(ACTIVE_PERIOD_ID);

    // Step 3: Admin closes and rolls
    ctx.db.hoursRetainer.findFirst.mockResolvedValue({
      id: RETAINER_ID,
      organizationId: "test-org-123",
      resetInterval: "MONTHLY",
      includedHours: new Prisma.Decimal(20),
    });
    ctx.db.hoursRetainerPeriod.findFirst.mockResolvedValue({
      id: ACTIVE_PERIOD_ID,
      retainerId: RETAINER_ID,
      status: "ACTIVE",
      label: "April 2026",
      periodEnd: new Date("2026-04-30T23:59:59.999Z"),
    });
    ctx.db.hoursRetainerPeriod.update.mockResolvedValue({
      id: ACTIVE_PERIOD_ID,
      status: "CLOSED",
      periodEnd: new Date("2026-04-30T23:59:59.999Z"),
    });
    ctx.db.hoursRetainerPeriod.create.mockResolvedValue({
      id: NEW_ACTIVE_PERIOD_ID,
      retainerId: RETAINER_ID,
      status: "ACTIVE",
      includedHoursSnapshot: new Prisma.Decimal(20),
    });

    const rolled = await adminCaller.closeAndRoll({ retainerId: RETAINER_ID });
    expect(rolled.closed.status).toBe("CLOSED");
    expect(rolled.opened.status).toBe("ACTIVE");

    // Step 4: Client opens portal — sees the retainer correctly
    ctx.db.client.findUnique.mockResolvedValue({ id: CLIENT_ID });
    ctx.db.hoursRetainer.findMany.mockResolvedValue([
      {
        id: RETAINER_ID,
        name: "Monthly 20",
        resetInterval: "MONTHLY",
        includedHours: new Prisma.Decimal(20),
        active: true,
        createdAt: new Date("2026-04-01"),
        periods: [
          {
            id: NEW_ACTIVE_PERIOD_ID,
            status: "ACTIVE",
            label: "May 2026",
            periodStart: new Date("2026-05-01"),
            periodEnd: new Date("2026-05-31T23:59:59.999Z"),
            includedHoursSnapshot: new Prisma.Decimal(20),
          },
          {
            id: ACTIVE_PERIOD_ID,
            status: "CLOSED",
            label: "April 2026",
            periodStart: new Date("2026-04-01"),
            periodEnd: new Date("2026-04-30T23:59:59.999Z"),
            includedHoursSnapshot: new Prisma.Decimal(20),
          },
        ],
        timeEntries: [
          {
            date: new Date("2026-04-14"),
            minutes: new Prisma.Decimal(300),
            note: "admin-only-note",
            retainerPeriodId: ACTIVE_PERIOD_ID,
          },
        ],
      },
    ]);

    const portalData = await portalCaller.listHoursRetainers({
      clientToken: "any-token",
    });

    expect(portalData).toHaveLength(1);
    expect(portalData[0].type).toBe("MONTHLY");
    expect(portalData[0].activePeriod?.label).toBe("May 2026");
    expect(portalData[0].previousPeriods).toHaveLength(1);
    expect(portalData[0].previousPeriods[0].label).toBe("April 2026");
    expect(portalData[0].previousPeriods[0].usedHours.toString()).toBe("5");

    // Critical: admin-only note NEVER leaks
    expect(JSON.stringify(portalData)).not.toContain("admin-only-note");
  });
});
