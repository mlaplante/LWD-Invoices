import { describe, it, expect, beforeEach, vi } from "vitest";
import { portalRouter } from "@/server/routers/portal";
import { createMockContext } from "./mocks/trpc-context";
import { Prisma } from "@/generated/prisma";

describe("portal.listHoursRetainers", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = portalRouter.createCaller(ctx);
  });

  it("throws NOT_FOUND for invalid token", async () => {
    ctx.db.client.findUnique.mockResolvedValue(null);
    await expect(caller.listHoursRetainers({ clientToken: "bad" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("returns empty array when client has no active retainers", async () => {
    ctx.db.client.findUnique.mockResolvedValue({ id: "client_1" });
    ctx.db.hoursRetainer.findMany.mockResolvedValue([]);
    const out = await caller.listHoursRetainers({ clientToken: "tok" });
    expect(out).toEqual([]);
  });

  it("aggregates BLOCK retainer hours and includes note in workLog", async () => {
    ctx.db.client.findUnique.mockResolvedValue({ id: "client_1" });
    ctx.db.hoursRetainer.findMany.mockResolvedValue([
      {
        id: "hr_1",
        name: "20-Hour Block",
        resetInterval: null,
        includedHours: new Prisma.Decimal(20),
        active: true,
        createdAt: new Date("2026-01-01"),
        periods: [],
        timeEntries: [
          {
            date: new Date("2026-04-14"),
            minutes: new Prisma.Decimal(120),
            note: "Deployed config changes",
            retainerPeriodId: null,
          },
        ],
      },
    ]);

    const out = await caller.listHoursRetainers({ clientToken: "tok" });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("BLOCK");
    expect(out[0].usedHours.toString()).toBe("2");
    expect(out[0].remainingHours.toString()).toBe("18");
    expect(out[0].overByHours).toBeNull();

    // Notes are client-facing work descriptions — included in workLog.
    expect(out[0].workLog[0].note).toBe("Deployed config changes");
    expect(Object.keys(out[0].workLog[0]).sort()).toEqual(["date", "hours", "note"]);
  });

  it("returns null note when time entry has no note", async () => {
    ctx.db.client.findUnique.mockResolvedValue({ id: "client_1" });
    ctx.db.hoursRetainer.findMany.mockResolvedValue([
      {
        id: "hr_1",
        name: "Block",
        resetInterval: null,
        includedHours: new Prisma.Decimal(10),
        active: true,
        createdAt: new Date("2026-01-01"),
        periods: [],
        timeEntries: [
          {
            date: new Date("2026-04-14"),
            minutes: new Prisma.Decimal(60),
            note: null,
            retainerPeriodId: null,
          },
        ],
      },
    ]);
    const out = await caller.listHoursRetainers({ clientToken: "tok" });
    expect(out[0].workLog[0].note).toBeNull();
  });

  it("MONTHLY retainer scopes workLog to the active period and computes period gauge", async () => {
    ctx.db.client.findUnique.mockResolvedValue({ id: "client_1" });
    ctx.db.hoursRetainer.findMany.mockResolvedValue([
      {
        id: "hr_2",
        name: "Monthly Maintenance",
        resetInterval: "MONTHLY",
        includedHours: new Prisma.Decimal(20),
        active: true,
        createdAt: new Date("2026-01-01"),
        periods: [
          {
            id: "p_active",
            status: "ACTIVE",
            label: "April 2026",
            periodStart: new Date("2026-04-01"),
            periodEnd: new Date("2026-04-30T23:59:59.999Z"),
            includedHoursSnapshot: new Prisma.Decimal(20),
          },
          {
            id: "p_closed",
            status: "CLOSED",
            label: "March 2026",
            periodStart: new Date("2026-03-01"),
            periodEnd: new Date("2026-03-31T23:59:59.999Z"),
            includedHoursSnapshot: new Prisma.Decimal(20),
          },
        ],
        timeEntries: [
          {
            date: new Date("2026-04-14"),
            minutes: new Prisma.Decimal(300),
            note: "Current period work",
            retainerPeriodId: "p_active",
          },
          {
            date: new Date("2026-03-20"),
            minutes: new Prisma.Decimal(1080),
            note: "Older period work",
            retainerPeriodId: "p_closed",
          },
        ],
      },
    ]);

    const out = await caller.listHoursRetainers({ clientToken: "tok" });
    expect(out).toHaveLength(1);
    const r = out[0];
    expect(r.type).toBe("MONTHLY");
    expect(r.activePeriod).not.toBeNull();
    expect(r.activePeriod!.label).toBe("April 2026");
    expect(r.activePeriod!.usedHours.toString()).toBe("5");
    expect(r.activePeriod!.remainingHours.toString()).toBe("15");

    expect(r.previousPeriods).toHaveLength(1);
    expect(r.previousPeriods[0].label).toBe("March 2026");
    expect(r.previousPeriods[0].usedHours.toString()).toBe("18");

    // workLog is scoped to the ACTIVE period for monthly retainers
    expect(r.workLog).toHaveLength(1);
    expect(r.workLog[0].date).toEqual(new Date("2026-04-14"));

    // Current-period note is included (client-facing); closed-period note is out of scope
    expect(r.workLog[0].note).toBe("Current period work");
    expect(JSON.stringify(out)).not.toContain("Older period work");
  });

  it("filters out inactive retainers", async () => {
    ctx.db.client.findUnique.mockResolvedValue({ id: "client_1" });
    ctx.db.hoursRetainer.findMany.mockResolvedValue([]);
    await caller.listHoursRetainers({ clientToken: "tok" });
    const call = ctx.db.hoursRetainer.findMany.mock.calls[0][0];
    expect(call.where.active).toBe(true);
  });
});
