/**
 * Project health scoring.
 *
 * Composite 0-100 health score per project from five deterministic signals —
 * budget burn, overdue tasks, unbilled time, unpaid invoices, and client
 * response rate — plus a band and surfaced signals. Pure function so it can be
 * unit-tested without a database; the router builds inputs from Prisma
 * aggregates and feeds them in, mirroring client-health-score.ts.
 */

export type ProjectHealthBand = "healthy" | "stable" | "at_risk" | "critical";

export interface ProjectHealthInput {
  projectId: string;
  projectName: string;
  clientName: string;
  /** Base budget + approved change-order totals, in money terms. */
  effectiveBudget: number;
  /** Consumed value: hours*rate, or flat amount progress. */
  loggedValue: number;
  isFlatRate: boolean;
  totalTasks: number;
  overdueTasks: number;
  billableHours: number;
  unbilledBillableHours: number;
  overdueInvoiceCount: number;
  overdueInvoiceAmount: number;
  emailsSent: number;
  emailsOpened: number;
  /** False when the project has no tasks/time/invoices to score. */
  hasActivity: boolean;
}

export interface ProjectHealthComponent {
  score: number;
  weight: number;
  detail: string;
}

export interface ProjectHealthScore {
  projectId: string;
  projectName: string;
  clientName: string;
  score: number;
  band: ProjectHealthBand;
  lowData: boolean;
  components: {
    budgetBurn: ProjectHealthComponent;
    overdueTasks: ProjectHealthComponent;
    unbilledTime: ProjectHealthComponent;
    unpaidInvoices: ProjectHealthComponent;
    responseRate: ProjectHealthComponent;
  };
  signals: string[];
}

const WEIGHTS = {
  budgetBurn: 0.3,
  overdueTasks: 0.2,
  unbilledTime: 0.15,
  unpaidInvoices: 0.2,
  responseRate: 0.15,
} as const;

const NEUTRAL_SCORE = 60;

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}
function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function scoreBudget(input: ProjectHealthInput): ProjectHealthComponent {
  if (input.effectiveBudget <= 0) {
    return { score: NEUTRAL_SCORE, weight: WEIGHTS.budgetBurn, detail: "No budget set." };
  }
  const ratio = input.loggedValue / input.effectiveBudget;
  // Within budget: gentle slope to 85 at 100%. Over budget: steep drop.
  const score = ratio <= 1 ? clamp(100 - ratio * 15) : clamp(85 - (ratio - 1) * 170);
  return {
    score: round(score),
    weight: WEIGHTS.budgetBurn,
    detail: `${Math.round(ratio * 100)}% of budget consumed.`,
  };
}

function scoreOverdueTasks(input: ProjectHealthInput): ProjectHealthComponent {
  if (input.totalTasks === 0) {
    return { score: NEUTRAL_SCORE, weight: WEIGHTS.overdueTasks, detail: "No tasks yet." };
  }
  const ratio = input.overdueTasks / input.totalTasks;
  return {
    score: round(clamp(100 - ratio * 120)),
    weight: WEIGHTS.overdueTasks,
    detail: `${input.overdueTasks} of ${input.totalTasks} task${input.totalTasks === 1 ? "" : "s"} overdue.`,
  };
}

function scoreUnbilled(input: ProjectHealthInput): ProjectHealthComponent {
  if (input.billableHours === 0) {
    return { score: 100, weight: WEIGHTS.unbilledTime, detail: "No billable time logged." };
  }
  const ratio = input.unbilledBillableHours / input.billableHours;
  return {
    score: round(clamp(100 - ratio * 60)),
    weight: WEIGHTS.unbilledTime,
    detail: `${Math.round(ratio * 100)}% of billable hours not yet invoiced.`,
  };
}

function scoreUnpaid(input: ProjectHealthInput): ProjectHealthComponent {
  let score = 100 - clamp(input.overdueInvoiceCount * 20, 0, 60);
  if (input.overdueInvoiceAmount > 0 && input.overdueInvoiceCount === 0) score -= 10;
  return {
    score: round(clamp(score)),
    weight: WEIGHTS.unpaidInvoices,
    detail: input.overdueInvoiceCount > 0
      ? `${input.overdueInvoiceCount} overdue invoice${input.overdueInvoiceCount === 1 ? "" : "s"} ($${round(input.overdueInvoiceAmount).toLocaleString("en-US")}).`
      : "No overdue invoices.",
  };
}

function scoreResponse(input: ProjectHealthInput): ProjectHealthComponent {
  if (input.emailsSent === 0) {
    return { score: NEUTRAL_SCORE, weight: WEIGHTS.responseRate, detail: "No tracked client emails." };
  }
  const openRate = input.emailsOpened / input.emailsSent;
  return {
    score: round(clamp(openRate * 100)),
    weight: WEIGHTS.responseRate,
    detail: `${Math.round(openRate * 100)}% email open rate.`,
  };
}

function bandFor(score: number): ProjectHealthBand {
  if (score >= 75) return "healthy";
  if (score >= 55) return "stable";
  if (score >= 35) return "at_risk";
  return "critical";
}

function buildSignals(input: ProjectHealthInput, c: ProjectHealthScore["components"]): string[] {
  const s: string[] = [];
  if (c.budgetBurn.score < 40) s.push("Over budget — review scope or raise a change order.");
  if (c.overdueTasks.score < 50) s.push("Several tasks are overdue — schedule a check-in.");
  if (c.unbilledTime.score < 60) s.push("Significant unbilled time — invoice the logged hours.");
  if (c.unpaidInvoices.score < 50) s.push("Overdue invoices on this client — prioritize collections.");
  return s;
}

export function calculateProjectHealthScore(input: ProjectHealthInput): ProjectHealthScore {
  const budgetBurn = scoreBudget(input);
  const overdueTasks = scoreOverdueTasks(input);
  const unbilledTime = scoreUnbilled(input);
  const unpaidInvoices = scoreUnpaid(input);
  const responseRate = scoreResponse(input);

  const composite =
    budgetBurn.score * budgetBurn.weight +
    overdueTasks.score * overdueTasks.weight +
    unbilledTime.score * unbilledTime.weight +
    unpaidInvoices.score * unpaidInvoices.weight +
    responseRate.score * responseRate.weight;

  const components = { budgetBurn, overdueTasks, unbilledTime, unpaidInvoices, responseRate };
  const score = round(clamp(composite));
  return {
    projectId: input.projectId,
    projectName: input.projectName,
    clientName: input.clientName,
    score,
    band: bandFor(score),
    lowData: !input.hasActivity,
    components,
    signals: buildSignals(input, components),
  };
}

export function calculateProjectHealthScores(inputs: ProjectHealthInput[]): ProjectHealthScore[] {
  return inputs
    .map(calculateProjectHealthScore)
    .sort((a, b) => a.score - b.score || a.projectName.localeCompare(b.projectName));
}
