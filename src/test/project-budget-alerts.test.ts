import { describe, it, expect } from "vitest";
import {
  budgetAlertCopy,
  evaluateBudgetAlert,
} from "@/server/services/project-budget-alerts";

const base = {
  projectedHours: 100,
  loggedHours: 0,
  alert80SentAt: null as Date | null,
  alert100SentAt: null as Date | null,
};

describe("evaluateBudgetAlert", () => {
  it("does nothing below the warning threshold", () => {
    const r = evaluateBudgetAlert({ ...base, loggedHours: 50 });
    expect(r.alert).toBeNull();
    expect(r.percentUsed).toBe(50);
  });

  it("warns once at 80%", () => {
    expect(evaluateBudgetAlert({ ...base, loggedHours: 80 }).alert).toBe("approaching");
    expect(
      evaluateBudgetAlert({ ...base, loggedHours: 85, alert80SentAt: new Date() }).alert,
    ).toBeNull();
  });

  it("alerts exceeded once at 100%, even if 80% never fired", () => {
    expect(evaluateBudgetAlert({ ...base, loggedHours: 120 }).alert).toBe("exceeded");
    expect(
      evaluateBudgetAlert({ ...base, loggedHours: 130, alert100SentAt: new Date() }).alert,
    ).toBeNull();
  });

  it("clears stale markers when the budget is raised", () => {
    const r = evaluateBudgetAlert({
      projectedHours: 200, // budget doubled
      loggedHours: 100, // now 50%
      alert80SentAt: new Date(),
      alert100SentAt: new Date(),
    });
    expect(r.alert).toBeNull();
    expect(r.clear80).toBe(true);
    expect(r.clear100).toBe(true);
  });

  it("re-enters the warning band after an exceeded marker is cleared", () => {
    const r = evaluateBudgetAlert({
      projectedHours: 100,
      loggedHours: 90,
      alert80SentAt: null,
      alert100SentAt: new Date(),
    });
    expect(r.clear100).toBe(true);
    expect(r.alert).toBe("approaching");
  });

  it("clears markers and stays quiet when the budget is removed", () => {
    const r = evaluateBudgetAlert({
      projectedHours: 0,
      loggedHours: 50,
      alert80SentAt: new Date(),
      alert100SentAt: null,
    });
    expect(r.alert).toBeNull();
    expect(r.clear80).toBe(true);
    expect(r.clear100).toBe(false);
    expect(r.percentUsed).toBe(0);
  });
});

describe("budgetAlertCopy", () => {
  it("describes the overrun with hours and percent", () => {
    const copy = budgetAlertCopy({
      projectName: "Website Redesign",
      percentUsed: 112,
      loggedHours: 112,
      projectedHours: 100,
      alert: "exceeded",
    });
    expect(copy.title).toContain("over budget");
    expect(copy.body).toContain("112%");
    expect(copy.body).toContain("112.0h of 100.0h");
  });

  it("describes the approaching case", () => {
    const copy = budgetAlertCopy({
      projectName: "Website Redesign",
      percentUsed: 84,
      loggedHours: 84,
      projectedHours: 100,
      alert: "approaching",
    });
    expect(copy.title).toContain("nearing budget");
    expect(copy.body).toContain("84%");
  });
});
