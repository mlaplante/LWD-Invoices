import { describe, it, expect, beforeEach } from "vitest";
import { dashboardRouter } from "@/server/routers/dashboard";
import { createMockContext } from "./mocks/trpc-context";

describe("dashboard new cards", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof dashboardRouter.createCaller>;
  beforeEach(() => {
    ctx = createMockContext();
    caller = dashboardRouter.createCaller(ctx);
  });

  it("openTasks counts incomplete tasks scoped to the org", async () => {
    ctx.db.projectTask.count.mockResolvedValue(7);
    const result = await caller.openTasks();
    expect(ctx.db.projectTask.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "test-org-123", isCompleted: false } }),
    );
    expect(result).toMatchObject({ openCount: 7 });
  });

  it("retainerBurn sums included vs used hours across active periods", async () => {
    ctx.db.hoursRetainerPeriod.findMany.mockResolvedValue([
      { includedHoursSnapshot: 10, timeEntries: [{ minutes: 300 }, { minutes: 60 }] }, // 6h used
    ]);
    const result = await caller.retainerBurn();
    expect(ctx.db.hoursRetainerPeriod.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "ACTIVE", retainer: { is: { organizationId: "test-org-123" } } }),
      }),
    );
    expect(result).toMatchObject({ includedHours: 10, usedHours: 6 });
  });
});
