import { describe, it, expect, beforeEach } from "vitest";
import { milestonesRouter } from "@/server/routers/milestones";
import { retainersRouter } from "@/server/routers/retainers";
import { timersRouter } from "@/server/routers/timers";
import { projectsRouter } from "@/server/routers/projects";
import { mileageRouter } from "@/server/routers/mileage";
import { recurringExpensesRouter } from "@/server/routers/recurringExpenses";
import { timeEntriesRouter } from "@/server/routers/timeEntries";
import { createMockContext } from "./mocks/trpc-context";

/**
 * Stamping a new row with organizationId: ctx.orgId does not prove that the
 * foreign keys the caller supplied belong to that org. Each procedure below
 * once accepted another tenant's id (obtainable from any invoice link that
 * tenant had sent) and wrote a row straddling two orgs.
 *
 * The mock DB's findFirst resolves null by default — i.e. "no such row in the
 * caller's org" — so every call here must be rejected before any write.
 */
describe("cross-tenant foreign keys are rejected", () => {
  let ctx: any;

  beforeEach(() => {
    ctx = createMockContext();
  });

  it("milestones.create rejects a project from another org", async () => {
    const caller = milestonesRouter.createCaller(ctx);
    await expect(
      caller.create({ projectId: "other-org-project", name: "M1", amount: 500, autoInvoice: true }),
    ).rejects.toThrow("Project not found");
    expect(ctx.db.milestone.create).not.toHaveBeenCalled();
  });

  it("retainers.getForClient rejects a client from another org before upserting", async () => {
    const caller = retainersRouter.createCaller(ctx);
    await expect(caller.getForClient({ clientId: "other-org-client" })).rejects.toThrow(
      "Client not found",
    );
  });

  it("timers.start rejects a task from another org", async () => {
    const caller = timersRouter.createCaller(ctx);
    await expect(caller.start({ taskId: "other-org-task" })).rejects.toThrow("Task not found");
    expect(ctx.db.timer.create).not.toHaveBeenCalled();
  });

  it("projects.create rejects a client from another org", async () => {
    const caller = projectsRouter.createCaller(ctx);
    await expect(
      caller.create({ name: "P", clientId: "other-org-client", currencyId: "cur-1" }),
    ).rejects.toThrow("Client not found");
    expect(ctx.db.project.create).not.toHaveBeenCalled();
  });

  it("projects.create rejects a currency from another org", async () => {
    ctx.db.client.findFirst.mockResolvedValue({ id: "client-1" });
    const caller = projectsRouter.createCaller(ctx);
    await expect(
      caller.create({ name: "P", clientId: "client-1", currencyId: "other-org-currency" }),
    ).rejects.toThrow("Currency not found");
  });

  it("mileage.create rejects a project from another org", async () => {
    const caller = mileageRouter.createCaller(ctx);
    await expect(
      caller.create({ date: new Date("2026-11-01"), miles: 12, projectId: "other-org-project" }),
    ).rejects.toThrow("Project not found");
  });

  it("recurringExpenses.create rejects a project from another org", async () => {
    const caller = recurringExpensesRouter.createCaller(ctx);
    await expect(
      caller.create({
        name: "Hosting",
        rate: 20,
        frequency: "MONTHLY",
        startDate: new Date("2026-11-01"),
        projectId: "other-org-project",
      }),
    ).rejects.toThrow("Project not found");
    expect(ctx.db.recurringExpense.create).not.toHaveBeenCalled();
  });

  it("timeEntries.update rejects re-pointing an entry at another org's task", async () => {
    ctx.db.timeEntry.findUnique.mockResolvedValue({ id: "te-1", organizationId: "test-org-123" });
    const caller = timeEntriesRouter.createCaller(ctx);
    await expect(caller.update({ id: "te-1", taskId: "other-org-task" })).rejects.toThrow(
      "Task not found",
    );
    expect(ctx.db.timeEntry.update).not.toHaveBeenCalled();
  });
});
