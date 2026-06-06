/**
 * Client health scoring.
 *
 * Produces a composite 0-100 health score per client from four deterministic
 * signal families — payment behavior, email engagement, revenue trend, and
 * dispute/overdue pressure — plus a churn-risk band and upsell signals. The
 * scoring math is a pure function (`calculateClientHealthScore`) so it can be
 * unit-tested without a database; the router builds `ClientHealthInput[]` from
 * Prisma aggregates and feeds them in, mirroring the split in
 * cash-flow-insights.ts.
 *
 * Consumers:
 * - clients router (`clients.healthScores`): powers the Client Health table on
 *   the reports surface and the per-client badge on the client detail header.
 * - retention check-ins: the band gives the retention workflow a data backbone
 *   ("reach out to at-risk clients first").
 */

export type ClientHealthBand = "healthy" | "stable" | "at_risk" | "critical";

export interface ClientHealthInput {
  clientId: string;
  clientName: string;
  /** Paid invoices with a due date, used for on-time scoring. */
  paidInvoiceCount: number;
  /** Of the paid invoices, how many settled on or before the due date. */
  onTimeInvoiceCount: number;
  /** Average days late across paid invoices (>= 0; 0 when always on time). */
  averageDaysLate: number;
  /** Currently-open invoices past their due date. */
  overdueOpenCount: number;
  /** Outstanding balance on overdue open invoices, in org currency. */
  overdueOpenAmount: number;
  /** Distinct invoice emails sent in the engagement window. */
  emailsSent: number;
  /** Of those, how many were opened at least once. */
  emailsOpened: number;
  /** Of those, how many had at least one link click. */
  emailsClicked: number;
  /** Collected revenue in the trailing 90 days. */
  recentRevenue: number;
  /** Collected revenue in the 90 days before that. */
  priorRevenue: number;
  /** Days since the client's most recent activity (payment/invoice), or null if never. */
  daysSinceLastActivity: number | null;
}

export interface ClientHealthComponent {
  /** 0-100 sub-score. */
  score: number;
  /** Weight applied to this component in the composite (sums to 1 across components). */
  weight: number;
  /** Short human-readable explanation of the sub-score. */
  detail: string;
}

export interface ClientHealthScore {
  clientId: string;
  clientName: string;
  /** Composite 0-100 score. */
  score: number;
  band: ClientHealthBand;
  /** True when there isn't enough history to score confidently; score is provisional. */
  lowData: boolean;
  components: {
    payment: ClientHealthComponent;
    engagement: ClientHealthComponent;
    revenueTrend: ClientHealthComponent;
    disputes: ClientHealthComponent;
  };
  /** Churn-risk percentage (0-100), the inverse of the composite, nudged by inactivity. */
  churnRiskPercent: number;
  /** Positive signals worth surfacing for upsell/retention. */
  signals: string[];
}

// Component weights. Payment reliability and overdue pressure dominate because
// they're the strongest leading indicators of churn for an invoicing business;
// engagement and revenue trend refine the picture.
const WEIGHTS = {
  payment: 0.4,
  engagement: 0.15,
  revenueTrend: 0.2,
  disputes: 0.25,
} as const;

// Below this many paid invoices we flag lowData and lean on neutral defaults so
// a single anomaly doesn't swing the score (mirrors MIN_INVOICES in
// client-payment-score.ts).
const MIN_PAID_FOR_CONFIDENCE = 3;
const NEUTRAL_SCORE = 60;

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function scorePayment(input: ClientHealthInput): ClientHealthComponent {
  if (input.paidInvoiceCount < MIN_PAID_FOR_CONFIDENCE) {
    return {
      score: NEUTRAL_SCORE,
      weight: WEIGHTS.payment,
      detail: `Only ${input.paidInvoiceCount} paid invoice${input.paidInvoiceCount === 1 ? "" : "s"} — not enough history yet.`,
    };
  }
  const onTimePercent = (input.onTimeInvoiceCount / input.paidInvoiceCount) * 100;
  // Penalize average lateness: every day late shaves ~2.5 points, capped so a
  // chronically-late payer still lands above zero on the on-time share alone.
  const latenessPenalty = clamp(input.averageDaysLate * 2.5, 0, 40);
  const score = clamp(onTimePercent - latenessPenalty);
  return {
    score: round(score),
    weight: WEIGHTS.payment,
    detail: `${Math.round(onTimePercent)}% paid on time, avg ${round(input.averageDaysLate)} day${input.averageDaysLate === 1 ? "" : "s"} late.`,
  };
}

function scoreEngagement(input: ClientHealthInput): ClientHealthComponent {
  if (input.emailsSent === 0) {
    return {
      score: NEUTRAL_SCORE,
      weight: WEIGHTS.engagement,
      detail: "No tracked emails sent yet.",
    };
  }
  const openRate = input.emailsOpened / input.emailsSent;
  const clickRate = input.emailsClicked / input.emailsSent;
  // Opens carry most of the weight; clicks are a strong positive signal that the
  // client is engaging with the payment link.
  const score = clamp(openRate * 70 + clickRate * 30 + Math.min(openRate, 1) * 0);
  return {
    score: round(score),
    weight: WEIGHTS.engagement,
    detail: `${Math.round(openRate * 100)}% open, ${Math.round(clickRate * 100)}% click across ${input.emailsSent} email${input.emailsSent === 1 ? "" : "s"}.`,
  };
}

function scoreRevenueTrend(input: ClientHealthInput): ClientHealthComponent {
  if (input.recentRevenue === 0 && input.priorRevenue === 0) {
    return {
      score: NEUTRAL_SCORE,
      weight: WEIGHTS.revenueTrend,
      detail: "No collected revenue in the trailing 180 days.",
    };
  }
  if (input.priorRevenue === 0) {
    // New revenue with no prior baseline — treat as a strong positive.
    return {
      score: 85,
      weight: WEIGHTS.revenueTrend,
      detail: "New revenue this period with no prior baseline.",
    };
  }
  const changePercent = ((input.recentRevenue - input.priorRevenue) / input.priorRevenue) * 100;
  // Map -100%..+100% change onto 0..100, centered at 50 for flat revenue.
  const score = clamp(50 + changePercent / 2);
  const direction = changePercent >= 0 ? "up" : "down";
  return {
    score: round(score),
    weight: WEIGHTS.revenueTrend,
    detail: `Revenue ${direction} ${Math.abs(Math.round(changePercent))}% vs the prior 90 days.`,
  };
}

function scoreDisputes(input: ClientHealthInput): ClientHealthComponent {
  // Start from a clean slate and subtract for overdue pressure. Each overdue
  // invoice costs 20 points; a large overdue balance relative to recent revenue
  // adds further drag.
  let score = 100 - clamp(input.overdueOpenCount * 20, 0, 60);
  if (input.overdueOpenAmount > 0 && input.recentRevenue > 0) {
    const ratio = input.overdueOpenAmount / input.recentRevenue;
    score -= clamp(ratio * 40, 0, 40);
  } else if (input.overdueOpenAmount > 0 && input.recentRevenue === 0) {
    score -= 25;
  }
  return {
    score: round(clamp(score)),
    weight: WEIGHTS.disputes,
    detail: input.overdueOpenCount > 0
      ? `${input.overdueOpenCount} overdue invoice${input.overdueOpenCount === 1 ? "" : "s"} ($${round(input.overdueOpenAmount).toLocaleString("en-US")} outstanding).`
      : "No overdue invoices.",
  };
}

function bandFor(score: number): ClientHealthBand {
  if (score >= 75) return "healthy";
  if (score >= 55) return "stable";
  if (score >= 35) return "at_risk";
  return "critical";
}

function buildSignals(input: ClientHealthInput, components: ClientHealthScore["components"]): string[] {
  const signals: string[] = [];
  if (components.payment.score >= 85 && input.paidInvoiceCount >= MIN_PAID_FOR_CONFIDENCE) {
    signals.push("Reliable payer — strong candidate for a retainer or net-terms upsell.");
  }
  if (components.revenueTrend.score >= 70) {
    signals.push("Revenue is growing — good moment to propose expanded scope.");
  }
  if (components.engagement.score >= 70) {
    signals.push("Highly engaged with your emails.");
  }
  if (input.daysSinceLastActivity !== null && input.daysSinceLastActivity > 120) {
    signals.push(`No activity in ${input.daysSinceLastActivity} days — schedule a retention check-in.`);
  }
  if (components.disputes.score < 40) {
    signals.push("Overdue pressure is high — prioritize collections follow-up.");
  }
  return signals;
}

export function calculateClientHealthScore(input: ClientHealthInput): ClientHealthScore {
  const payment = scorePayment(input);
  const engagement = scoreEngagement(input);
  const revenueTrend = scoreRevenueTrend(input);
  const disputes = scoreDisputes(input);

  const composite =
    payment.score * payment.weight +
    engagement.score * engagement.weight +
    revenueTrend.score * revenueTrend.weight +
    disputes.score * disputes.weight;

  const score = round(clamp(composite));
  const components = { payment, engagement, revenueTrend, disputes };
  const lowData = input.paidInvoiceCount < MIN_PAID_FOR_CONFIDENCE;

  // Churn risk is the inverse of health, nudged up when the client has gone
  // quiet for a long stretch.
  let churnRisk = 100 - score;
  if (input.daysSinceLastActivity !== null && input.daysSinceLastActivity > 90) {
    churnRisk = clamp(churnRisk + Math.min((input.daysSinceLastActivity - 90) / 6, 20));
  }

  return {
    clientId: input.clientId,
    clientName: input.clientName,
    score,
    band: bandFor(score),
    lowData,
    components,
    churnRiskPercent: round(clamp(churnRisk)),
    signals: buildSignals(input, components),
  };
}

export function calculateClientHealthScores(inputs: ClientHealthInput[]): ClientHealthScore[] {
  return inputs
    .map(calculateClientHealthScore)
    .sort((a, b) => a.score - b.score || a.clientName.localeCompare(b.clientName));
}
