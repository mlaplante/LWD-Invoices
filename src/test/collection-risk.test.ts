import { describe, it, expect } from "vitest";
import {
  scoreCollectionRisk,
  prioritizeCollections,
  type CollectionRiskInput,
} from "@/server/services/collection-risk";

function input(overrides: Partial<CollectionRiskInput> = {}): CollectionRiskInput {
  return {
    invoiceId: "i1",
    invoiceNumber: "INV-001",
    clientId: "c1",
    clientName: "Acme",
    balance: 1000,
    daysUntilDue: 10,
    clientOnTimePercent: 95,
    clientAvgDaysLate: 0,
    isReliablePayer: true,
    remindersSent: 0,
    invoiceOpened: true,
    invoiceClicked: false,
    ...overrides,
  };
}

describe("scoreCollectionRisk", () => {
  it("monitors a not-yet-due invoice from a reliable payer", () => {
    const result = scoreCollectionRisk(input());
    expect(result.recommendedAction).toBe("monitor");
    expect(result.actionDue).toBe(false);
    expect(result.band).toBe("low");
  });

  it("uses a neutral baseline when there is no payment history", () => {
    const result = scoreCollectionRisk(
      input({ clientOnTimePercent: null, isReliablePayer: false, daysUntilDue: 0 }),
    );
    expect(result.reasons.some((r) => r.includes("neutral baseline"))).toBe(true);
  });

  it("recommends a pre-due nudge for a close-due risky non-reliable payer", () => {
    const result = scoreCollectionRisk(
      input({
        daysUntilDue: 3,
        clientOnTimePercent: 30,
        clientAvgDaysLate: 12,
        isReliablePayer: false,
      }),
    );
    expect(result.recommendedAction).toBe("pre_due_nudge");
    expect(result.actionDue).toBe(true);
  });

  it("escalates risk and recommends a standard reminder just after due", () => {
    const result = scoreCollectionRisk(
      input({ daysUntilDue: -3, clientOnTimePercent: 60, isReliablePayer: false }),
    );
    expect(result.daysOverdue).toBe(3);
    expect(result.recommendedAction).toBe("reminder");
  });

  it("recommends a firm reminder past a week overdue", () => {
    const result = scoreCollectionRisk(
      input({ daysUntilDue: -10, clientOnTimePercent: 70, isReliablePayer: false }),
    );
    expect(result.recommendedAction).toBe("firm_reminder");
    expect(result.recommendedTone).toBe("firm");
  });

  it("recommends a final notice once far overdue", () => {
    const result = scoreCollectionRisk(
      input({ daysUntilDue: -35, clientOnTimePercent: 70, isReliablePayer: false }),
    );
    expect(result.recommendedAction).toBe("final_notice");
  });

  it("escalates to a human after reminders are exhausted with no engagement", () => {
    const result = scoreCollectionRisk(
      input({
        daysUntilDue: -20,
        clientOnTimePercent: 30,
        isReliablePayer: false,
        remindersSent: 3,
        invoiceOpened: false,
        invoiceClicked: false,
      }),
    );
    expect(result.recommendedAction).toBe("escalate");
    expect(result.band).toBe("severe");
  });

  it("holds off a soft reminder when one was sent within the cooldown window", () => {
    const justReminded = scoreCollectionRisk(
      input({
        daysUntilDue: -10,
        clientOnTimePercent: 70,
        isReliablePayer: false,
        remindersSent: 1,
        daysSinceLastReminder: 1,
      }),
    );
    // A firm_reminder would normally fire at 10 days overdue; the recent send holds it.
    expect(justReminded.recommendedAction).toBe("monitor");
    expect(justReminded.actionDue).toBe(false);
    expect(justReminded.daysSinceLastReminder).toBe(1);
    expect(justReminded.reasons.some((r) => r.includes("Reminder sent recently"))).toBe(true);
  });

  it("resumes the reminder once the cooldown has elapsed", () => {
    const cooledDown = scoreCollectionRisk(
      input({
        daysUntilDue: -10,
        clientOnTimePercent: 70,
        isReliablePayer: false,
        remindersSent: 1,
        daysSinceLastReminder: 5,
      }),
    );
    expect(cooledDown.recommendedAction).toBe("firm_reminder");
    expect(cooledDown.actionDue).toBe(true);
  });

  it("still escalates a far-overdue invoice even within the cooldown window", () => {
    const result = scoreCollectionRisk(
      input({
        daysUntilDue: -40,
        clientOnTimePercent: 40,
        isReliablePayer: false,
        remindersSent: 2,
        daysSinceLastReminder: 1,
      }),
    );
    // final_notice is a deliberate escalation and ignores the soft cooldown.
    expect(result.recommendedAction).toBe("final_notice");
  });

  it("lowers risk when the payment link was clicked", () => {
    const clicked = scoreCollectionRisk(
      input({ daysUntilDue: -3, clientOnTimePercent: 60, isReliablePayer: false, invoiceClicked: true }),
    );
    const notClicked = scoreCollectionRisk(
      input({ daysUntilDue: -3, clientOnTimePercent: 60, isReliablePayer: false, invoiceClicked: false }),
    );
    expect(clicked.lateRiskPercent).toBeLessThan(notClicked.lateRiskPercent);
  });

  it("raises risk when an overdue invoice was never opened", () => {
    const ignored = scoreCollectionRisk(
      input({ daysUntilDue: -6, clientOnTimePercent: 60, isReliablePayer: false, invoiceOpened: false }),
    );
    const opened = scoreCollectionRisk(
      input({ daysUntilDue: -6, clientOnTimePercent: 60, isReliablePayer: false, invoiceOpened: true }),
    );
    expect(ignored.lateRiskPercent).toBeGreaterThan(opened.lateRiskPercent);
  });
});

describe("scoreCollectionRisk — payment probability", () => {
  it("derives paymentProbabilityPercent as the inverse of late risk", () => {
    const result = scoreCollectionRisk(input());
    expect(result.paymentProbabilityPercent).toBe(100 - result.lateRiskPercent);
  });

  it("bands a reliable, not-yet-due invoice as high probability", () => {
    const result = scoreCollectionRisk(input());
    expect(result.paymentProbabilityBand).toBe("high");
  });

  it("bands a far-overdue, poor-history invoice as low probability", () => {
    const result = scoreCollectionRisk(
      input({
        daysUntilDue: -45,
        clientOnTimePercent: 15,
        clientAvgDaysLate: 20,
        isReliablePayer: false,
        invoiceOpened: false,
      }),
    );
    expect(result.paymentProbabilityBand).toBe("low");
  });
});

describe("scoreCollectionRisk — new signals", () => {
  it("raises risk and explains when the invoice is well above the client norm", () => {
    const baseline = scoreCollectionRisk(input({ daysUntilDue: -5, isReliablePayer: false }));
    const large = scoreCollectionRisk(
      input({ daysUntilDue: -5, isReliablePayer: false, amountVsClientNorm: 3 }),
    );
    expect(large.lateRiskPercent).toBeGreaterThan(baseline.lateRiskPercent);
    expect(large.reasons.some((r) => r.includes("typical amount"))).toBe(true);
  });

  it("does not adjust risk for a normal-sized invoice (ratio near 1)", () => {
    const baseline = scoreCollectionRisk(input({ daysUntilDue: -5, isReliablePayer: false }));
    const normal = scoreCollectionRisk(
      input({ daysUntilDue: -5, isReliablePayer: false, amountVsClientNorm: 1 }),
    );
    expect(normal.lateRiskPercent).toBe(baseline.lateRiskPercent);
  });

  it("raises risk and explains when the client has prior disputes", () => {
    const baseline = scoreCollectionRisk(input({ daysUntilDue: -5, isReliablePayer: false }));
    const disputed = scoreCollectionRisk(
      input({ daysUntilDue: -5, isReliablePayer: false, priorDisputes: 2 }),
    );
    expect(disputed.lateRiskPercent).toBeGreaterThan(baseline.lateRiskPercent);
    expect(disputed.reasons.some((r) => r.includes("prior dispute"))).toBe(true);
  });

  it("is unchanged when the new optional signals are omitted (backward compatible)", () => {
    const without = scoreCollectionRisk(input({ daysUntilDue: -5, isReliablePayer: false }));
    const withNeutral = scoreCollectionRisk(
      input({ daysUntilDue: -5, isReliablePayer: false, amountVsClientNorm: null, priorDisputes: 0 }),
    );
    expect(withNeutral.lateRiskPercent).toBe(without.lateRiskPercent);
  });
});

describe("prioritizeCollections", () => {
  it("surfaces action-due, highest-risk invoices first and monitors last", () => {
    const results = prioritizeCollections([
      input({ invoiceId: "calm", daysUntilDue: 20 }), // monitor
      input({
        invoiceId: "urgent",
        daysUntilDue: -40,
        clientOnTimePercent: 20,
        isReliablePayer: false,
        balance: 5000,
      }),
      input({
        invoiceId: "mild",
        daysUntilDue: -2,
        clientOnTimePercent: 80,
        isReliablePayer: false,
      }),
    ]);
    expect(results[0].invoiceId).toBe("urgent");
    expect(results[results.length - 1].invoiceId).toBe("calm");
  });
});
