import { describe, it, expect, beforeEach } from "vitest";
import { projectsRouter } from "@/server/routers/projects";
import { createMockContext } from "./mocks/trpc-context";

describe("projects.healthScore", () => {
  let ctx: any;
  beforeEach(() => { ctx = createMockContext(); });

  it("returns null when the project is not found", async () => {
    ctx.db.project.findFirst.mockResolvedValue(null);
    const r = await projectsRouter.createCaller(ctx).healthScore({ projectId: "missing" });
    expect(r.score).toBeNull();
  });

  it("returns a composite score for a project with data", async () => {
    ctx.db.project.findFirst.mockResolvedValue({
      id: "p1", name: "Website", isFlatRate: false,
      rate: { toNumber: () => 100 }, projectedHours: 100,
      clientId: "c1",
      client: { id: "c1", name: "Acme" },
      tasks: [
        { isCompleted: false, dueDate: new Date("2020-01-01") },
        { isCompleted: true, dueDate: null },
      ],
      timeEntries: [
        { minutes: { toNumber: () => 600 }, invoiceLineId: null, retainerId: null },
      ],
    });
    ctx.db.invoice.findMany.mockResolvedValue([]);
    ctx.db.emailEvent.findMany.mockResolvedValue([]);
    const r = await projectsRouter.createCaller(ctx).healthScore({ projectId: "p1" });
    expect(r.score).not.toBeNull();
    expect(["healthy","stable","at_risk","critical"]).toContain(r.score!.band);
    expect(r.score!.components.budgetBurn.score).toBeGreaterThanOrEqual(0);
    expect(r.score!.components.budgetBurn.score).toBeLessThanOrEqual(100);
    expect(r.score!.lowData).toBe(false);
  });
});

describe("projects.healthScores", () => {
  let ctx: any;
  beforeEach(() => { ctx = createMockContext(); });

  it("returns empty scores for an org with no projects", async () => {
    ctx.db.project.findMany.mockResolvedValue([]);
    const r = await projectsRouter.createCaller(ctx).healthScores();
    expect(r.scores).toHaveLength(0);
    expect(typeof r.generatedAt).toBe("string");
  });

  it("returns two scores sorted ascending for an org with two projects", async () => {
    // buildProjectHealthInputs now bulk-loads all projects in one findMany with
    // the full select, so the stubs carry full project data (no per-project
    // findFirst). "pa" has an overdue task → lower score; "pb" only a completed
    // task → higher.
    ctx.db.project.findMany.mockResolvedValue([
      {
        id: "pa", name: "Alpha", isFlatRate: false,
        rate: { toNumber: () => 100 }, projectedHours: 100,
        clientId: "ca",
        client: { id: "ca", name: "Client A" },
        tasks: [
          { isCompleted: false, dueDate: new Date("2020-01-01") }, // overdue task
        ],
        timeEntries: [
          { minutes: { toNumber: () => 300 }, invoiceLineId: null, retainerId: null },
        ],
      },
      {
        id: "pb", name: "Beta", isFlatRate: false,
        rate: { toNumber: () => 100 }, projectedHours: 100,
        clientId: "cb",
        client: { id: "cb", name: "Client B" },
        tasks: [
          { isCompleted: true, dueDate: new Date("2020-01-01") }, // completed — no penalty
        ],
        timeEntries: [
          { minutes: { toNumber: () => 300 }, invoiceLineId: null, retainerId: null },
        ],
      },
    ]);

    ctx.db.invoice.findMany.mockResolvedValue([]);
    ctx.db.emailEvent.findMany.mockResolvedValue([]);

    const r = await projectsRouter.createCaller(ctx).healthScores();
    expect(r.scores).toHaveLength(2);
    expect(typeof r.generatedAt).toBe("string");
    // calculateProjectHealthScores sorts ascending by score
    expect(r.scores[0].score).toBeLessThanOrEqual(r.scores[1].score);
  });
});
