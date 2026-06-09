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
        { minutes: { toNumber: () => 600 }, invoiceLineId: null, retainerId: null, project: { isFlatRate: false, rate: { toNumber: () => 100 } } },
      ],
    });
    ctx.db.invoice.findMany.mockResolvedValue([]);
    ctx.db.emailEvent.findMany.mockResolvedValue([]);
    const r = await projectsRouter.createCaller(ctx).healthScore({ projectId: "p1" });
    expect(r.score).not.toBeNull();
    expect(typeof r.score!.score).toBe("number");
  });
});
