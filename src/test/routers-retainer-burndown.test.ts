import { describe, it, expect, beforeEach } from "vitest";
import { hoursRetainersRouter } from "@/server/routers/hoursRetainers";
import { retainersRouter } from "@/server/routers/retainers";
import { createMockContext } from "./mocks/trpc-context";

describe("retainer burndown procedures", () => {
  let ctx: any;
  beforeEach(() => { ctx = createMockContext(); });

  it("hoursRetainers.burndown returns one row per retainer's active period", async () => {
    ctx.db.hoursRetainer.findMany.mockResolvedValue([
      {
        id: "r1", name: "Monthly", clientId: "c1", client: { id: "c1", name: "Acme" },
        periods: [{
          id: "p1", label: "Jun 2026", status: "ACTIVE",
          periodStart: new Date("2026-06-01T00:00:00Z"),
          periodEnd: new Date("2026-06-30T23:59:59Z"),
          includedHoursSnapshot: { toNumber: () => 20 },
          timeEntries: [{ minutes: { toNumber: () => 420 } }], // 7h
        }],
      },
    ]);
    const rows = await hoursRetainersRouter.createCaller(ctx).burndown();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("hours");
    expect(rows[0].remaining).toBe(13);
  });

  it("retainers.burndown returns one row per money retainer", async () => {
    ctx.db.retainer.findMany.mockResolvedValue([
      {
        id: "r2", clientId: "c2", balance: { toNumber: () => 4000 },
        client: { id: "c2", name: "Globex" },
        transactions: [
          { type: "deposit", amount: { toNumber: () => 10000 }, createdAt: new Date("2026-01-01Z") },
          { type: "drawdown", amount: { toNumber: () => 6000 }, createdAt: new Date("2026-06-01Z") },
        ],
      },
    ]);
    const rows = await retainersRouter.createCaller(ctx).burndown();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("money");
    expect(rows[0].remaining).toBe(4000);
  });
});
