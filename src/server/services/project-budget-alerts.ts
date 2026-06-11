/**
 * Project budget alerts — pure threshold evaluation for the daily cron.
 *
 * Projects with a non-zero `projectedHours` budget alert org admins once at
 * 80% ("approaching") and once at 100% ("exceeded") of logged hours. The
 * sent-markers live on the Project row; this module decides which alert (if
 * any) to send now and which stale markers to clear so a raised budget can
 * re-alert later.
 */

export const WARN_THRESHOLD_PCT = 80;

export type BudgetAlertEvaluation = {
  /** Alert to send now, if any. */
  alert: "approaching" | "exceeded" | null;
  /** Markers that no longer reflect reality (budget raised / entries removed). */
  clear80: boolean;
  clear100: boolean;
  /** Whole-number percent of budget used (can exceed 100). */
  percentUsed: number;
};

export function evaluateBudgetAlert(opts: {
  projectedHours: number;
  loggedHours: number;
  alert80SentAt: Date | null;
  alert100SentAt: Date | null;
}): BudgetAlertEvaluation {
  const { projectedHours, loggedHours, alert80SentAt, alert100SentAt } = opts;

  if (projectedHours <= 0) {
    // No budget — nothing to alert on; clear any markers left from when one existed.
    return {
      alert: null,
      clear80: alert80SentAt !== null,
      clear100: alert100SentAt !== null,
      percentUsed: 0,
    };
  }

  const percentUsed = Math.round((loggedHours / projectedHours) * 100);

  const clear80 = alert80SentAt !== null && percentUsed < WARN_THRESHOLD_PCT;
  const clear100 = alert100SentAt !== null && percentUsed < 100;

  if (percentUsed >= 100 && alert100SentAt === null) {
    return { alert: "exceeded", clear80, clear100, percentUsed };
  }
  if (percentUsed >= WARN_THRESHOLD_PCT && percentUsed < 100 && alert80SentAt === null) {
    return { alert: "approaching", clear80, clear100, percentUsed };
  }

  return { alert: null, clear80, clear100, percentUsed };
}

export function budgetAlertCopy(opts: {
  projectName: string;
  percentUsed: number;
  loggedHours: number;
  projectedHours: number;
  alert: "approaching" | "exceeded";
}): { title: string; body: string } {
  const hours = `${opts.loggedHours.toFixed(1)}h of ${opts.projectedHours.toFixed(1)}h`;
  if (opts.alert === "exceeded") {
    return {
      title: `Project over budget: ${opts.projectName}`,
      body: `${opts.projectName} has used ${opts.percentUsed}% of its hours budget (${hours}). Consider a change order or scope review.`,
    };
  }
  return {
    title: `Project nearing budget: ${opts.projectName}`,
    body: `${opts.projectName} has used ${opts.percentUsed}% of its hours budget (${hours}).`,
  };
}
