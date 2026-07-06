import { describe, it, expect } from "vitest";
import { createMockContext } from "./mocks/prisma";
import { milestonesRouter } from "@/server/routers/milestones";
import { tasksRouter } from "@/server/routers/tasks";
import { timeEntriesRouter } from "@/server/routers/timeEntries";
import { timersRouter } from "@/server/routers/timers";
import { discussionsRouter } from "@/server/routers/discussions";
import { taskStatusesRouter } from "@/server/routers/taskStatuses";
import { projectTemplatesRouter } from "@/server/routers/projectTemplates";
import { proposalTemplatesRouter } from "@/server/routers/proposal-templates";

// A VIEWER is a read-only role: it must be blocked from every business-data
// mutation, but must retain read (query) access. These tests lock in the
// requireRole gating added across the operational routers.

function viewer() {
  const ctx = createMockContext({ userRole: "VIEWER" });
  return ctx;
}

describe("VIEWER role gating (read-only enforcement)", () => {
  it("blocks VIEWER from representative mutations with FORBIDDEN", async () => {
    const ctx = viewer();
    const cases: Array<() => Promise<unknown>> = [
      () => milestonesRouter.createCaller(ctx).create({ projectId: "p1", name: "M" }),
      () => milestonesRouter.createCaller(ctx).delete({ id: "m1" }),
      () => tasksRouter.createCaller(ctx).create({ projectId: "p1", name: "T" }),
      () => tasksRouter.createCaller(ctx).billToInvoice({ invoiceId: "i1", taskIds: ["t1"] }),
      () => timeEntriesRouter.createCaller(ctx).delete({ id: "te1" }),
      () => timersRouter.createCaller(ctx).start({ taskId: "t1" }),
      () => discussionsRouter.createCaller(ctx).create({ projectId: "p1", subject: "S", body: "hi" }),
      () => taskStatusesRouter.createCaller(ctx).create({ title: "S" }),
      () => projectTemplatesRouter.createCaller(ctx).delete({ id: "pt1" }),
      () => proposalTemplatesRouter.createCaller(ctx).delete({ id: "pt1" }),
    ];

    for (const call of cases) {
      await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("still allows VIEWER to read (list query)", async () => {
    const ctx = viewer();
    ctx.db.milestone.findMany.mockResolvedValue([]);
    await expect(
      milestonesRouter.createCaller(ctx).list({ projectId: "p1" }),
    ).resolves.toEqual([]);
    expect(ctx.db.milestone.findMany).toHaveBeenCalled();
  });

  it("allows a non-VIEWER role past the gate (ACCOUNTANT can create)", async () => {
    const ctx = createMockContext({ userRole: "ACCOUNTANT" });
    ctx.db.milestone.create.mockResolvedValue({ id: "m1" });
    await expect(
      milestonesRouter.createCaller(ctx).create({ projectId: "p1", name: "M" }),
    ).resolves.toEqual({ id: "m1" });
  });
});
