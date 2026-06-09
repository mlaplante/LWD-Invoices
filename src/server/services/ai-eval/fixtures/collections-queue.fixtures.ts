import type { EvalCase } from "../types";
import type { CollectionsQueueInput, CollectionsQueueExpected } from "../graders";
import type { CollectionRiskScore } from "../../collection-risk";

function score(o: Partial<CollectionRiskScore>): CollectionRiskScore {
  return {
    invoiceId: "i",
    invoiceNumber: "INV",
    clientId: "c",
    clientName: "Client",
    balance: 100,
    daysOverdue: 0,
    lateRiskPercent: 0,
    paymentProbabilityPercent: 100,
    paymentProbabilityBand: "high",
    band: "low",
    recommendedAction: "monitor",
    recommendedTone: "helpful",
    actionDue: false,
    daysSinceLastReminder: null,
    reasons: [],
    ...o,
  };
}

export const collectionsQueueCases: EvalCase<CollectionsQueueInput, CollectionsQueueExpected>[] = [
  {
    id: "action-due-first",
    description: "CRITICAL: action-due invoices always outrank monitor-only ones",
    critical: true,
    input: {
      scores: [
        score({ invoiceId: "monitor", actionDue: false, lateRiskPercent: 99, balance: 99999 }),
        score({ invoiceId: "due", actionDue: true, lateRiskPercent: 1, balance: 1 }),
      ],
    },
    expected: { order: ["due", "monitor"] },
  },
  {
    id: "exposure-order",
    description: "within action-due, higher lateRisk×balance ranks first",
    input: {
      scores: [
        score({ invoiceId: "small", actionDue: true, lateRiskPercent: 80, balance: 100 }),
        score({ invoiceId: "big", actionDue: true, lateRiskPercent: 50, balance: 1000 }),
      ],
    },
    expected: { order: ["big", "small"] },
  },
  {
    id: "stable-tiebreak",
    description: "equal exposure ties break by invoiceId for reproducibility",
    input: {
      scores: [
        score({ invoiceId: "b", actionDue: true, lateRiskPercent: 50, balance: 100 }),
        score({ invoiceId: "a", actionDue: true, lateRiskPercent: 50, balance: 100 }),
      ],
    },
    expected: { order: ["a", "b"] },
  },
];
