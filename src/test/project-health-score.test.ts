import { describe, it, expect } from "vitest";
import {
  calculateProjectHealthScore,
  calculateProjectHealthScores,
  type ProjectHealthInput,
} from "@/server/services/project-health-score";

function base(o: Partial<ProjectHealthInput> = {}): ProjectHealthInput {
  return {
    projectId: "p1", projectName: "Website", clientName: "Acme",
    effectiveBudget: 10000, loggedValue: 4000, isFlatRate: false,
    totalTasks: 10, overdueTasks: 0,
    billableHours: 40, unbilledBillableHours: 0,
    overdueInvoiceCount: 0, overdueInvoiceAmount: 0,
    emailsSent: 10, emailsOpened: 9,
    hasActivity: true, ...o,
  };
}

describe("calculateProjectHealthScore", () => {
  it("scores a healthy project", () => {
    const r = calculateProjectHealthScore(base());
    expect(r.band).toBe("healthy");
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.lowData).toBe(false);
  });

  it("drops the score when over budget", () => {
    const r = calculateProjectHealthScore(base({ loggedValue: 16000 }));
    expect(r.components.budgetBurn.score).toBeLessThan(40);
  });

  it("penalizes overdue tasks", () => {
    const r = calculateProjectHealthScore(base({ overdueTasks: 8 }));
    expect(r.components.overdueTasks.score).toBeLessThan(40);
  });

  it("penalizes a high unbilled share", () => {
    const r = calculateProjectHealthScore(base({ unbilledBillableHours: 40 }));
    expect(r.components.unbilledTime.score).toBeLessThan(60);
  });

  it("flags lowData when the project has no activity, using neutral defaults", () => {
    const r = calculateProjectHealthScore(base({
      hasActivity: false, totalTasks: 0, billableHours: 0,
      effectiveBudget: 0, loggedValue: 0, emailsSent: 0,
    }));
    expect(r.lowData).toBe(true);
    expect(r.score).toBeGreaterThan(40);
  });

  it("sorts worst-first", () => {
    const list = calculateProjectHealthScores([
      base({ projectId: "good" }),
      base({ projectId: "bad", overdueTasks: 9, loggedValue: 18000, overdueInvoiceCount: 3 }),
    ]);
    expect(list[0].projectId).toBe("bad");
  });
});
