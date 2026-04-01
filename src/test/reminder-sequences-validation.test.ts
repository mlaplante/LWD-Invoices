import { describe, it, expect } from "vitest";

type ReminderStepInput = {
  daysRelativeToDue: number;
  subject: string;
  body: string;
  sort: number;
};

/**
 * Validates that steps are in chronological order by daysRelativeToDue
 */
export function validateStepOrder(steps: ReminderStepInput[]): string | null {
  const sorted = [...steps].sort((a, b) => a.sort - b.sort);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].daysRelativeToDue < sorted[i - 1].daysRelativeToDue) {
      return `Step ${i + 1} (day ${sorted[i].daysRelativeToDue}) is before step ${i} (day ${sorted[i - 1].daysRelativeToDue}) chronologically but has a later sort order`;
    }
  }
  return null;
}

/**
 * Determines which reminder step should fire today for a given invoice.
 */
export function getStepDueToday(
  now: Date,
  dueDate: Date,
  steps: { id: string; daysRelativeToDue: number }[],
  sentStepIds: Set<string>
): { id: string; daysRelativeToDue: number } | null {
  const dueMidnight = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const nowMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysFromDue = Math.round((nowMidnight - dueMidnight) / 86400000);

  // Find the step that matches today (daysRelativeToDue == daysFromDue)
  // and hasn't been sent yet
  for (const step of steps) {
    if (step.daysRelativeToDue === daysFromDue && !sentStepIds.has(step.id)) {
      return step;
    }
  }
  return null;
}

describe("validateStepOrder", () => {
  it("returns null for valid chronological order", () => {
    const steps: ReminderStepInput[] = [
      { daysRelativeToDue: -3, subject: "s", body: "b", sort: 0 },
      { daysRelativeToDue: 0, subject: "s", body: "b", sort: 1 },
      { daysRelativeToDue: 7, subject: "s", body: "b", sort: 2 },
    ];
    expect(validateStepOrder(steps)).toBeNull();
  });

  it("detects out-of-order steps", () => {
    const steps: ReminderStepInput[] = [
      { daysRelativeToDue: 7, subject: "s", body: "b", sort: 0 },
      { daysRelativeToDue: -3, subject: "s", body: "b", sort: 1 },
    ];
    expect(validateStepOrder(steps)).toContain("before step");
  });
});

describe("getStepDueToday", () => {
  it("returns matching step for today", () => {
    const dueDate = new Date("2026-04-10T00:00:00Z");
    const now = new Date("2026-04-07T10:00:00Z"); // 3 days before due = -3
    const steps = [
      { id: "s1", daysRelativeToDue: -3 },
      { id: "s2", daysRelativeToDue: 0 },
      { id: "s3", daysRelativeToDue: 7 },
    ];
    const result = getStepDueToday(now, dueDate, steps, new Set());
    expect(result?.id).toBe("s1");
  });

  it("skips already-sent steps", () => {
    const dueDate = new Date("2026-04-10T00:00:00Z");
    const now = new Date("2026-04-07T10:00:00Z"); // -3
    const steps = [
      { id: "s1", daysRelativeToDue: -3 },
      { id: "s2", daysRelativeToDue: 0 },
    ];
    const result = getStepDueToday(now, dueDate, steps, new Set(["s1"]));
    expect(result).toBeNull();
  });

  it("returns null when no step matches today", () => {
    const dueDate = new Date("2026-04-10T00:00:00Z");
    const now = new Date("2026-04-05T10:00:00Z"); // -5, no step for this
    const steps = [
      { id: "s1", daysRelativeToDue: -3 },
      { id: "s2", daysRelativeToDue: 0 },
    ];
    const result = getStepDueToday(now, dueDate, steps, new Set());
    expect(result).toBeNull();
  });

  it("matches on-due-date step", () => {
    const dueDate = new Date("2026-04-10T00:00:00Z");
    const now = new Date("2026-04-10T10:00:00Z"); // day 0
    const steps = [
      { id: "s1", daysRelativeToDue: -3 },
      { id: "s2", daysRelativeToDue: 0 },
      { id: "s3", daysRelativeToDue: 7 },
    ];
    const result = getStepDueToday(now, dueDate, steps, new Set(["s1"]));
    expect(result?.id).toBe("s2");
  });

  it("matches post-due-date step", () => {
    const dueDate = new Date("2026-04-10T00:00:00Z");
    const now = new Date("2026-04-17T10:00:00Z"); // +7
    const steps = [
      { id: "s1", daysRelativeToDue: -3 },
      { id: "s2", daysRelativeToDue: 0 },
      { id: "s3", daysRelativeToDue: 7 },
    ];
    const result = getStepDueToday(now, dueDate, steps, new Set(["s1", "s2"]));
    expect(result?.id).toBe("s3");
  });
});
