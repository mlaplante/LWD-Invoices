/**
 * Predictive collections / smart dunning escalation.
 *
 * Scores the probability that an open invoice will be paid late, then maps that
 * score (together with how overdue the invoice is, how the client has engaged
 * with prior reminders, and how many reminders have already gone out) to a
 * recommended escalation action and tone. This is the successor to the
 * single-shot AI reminder: instead of a fixed day-offset sequence, the AI/UI
 * can decide *when* and *how hard* to escalate per invoice.
 *
 * Pure function (`scoreCollectionRisk`) so it's unit-testable; the router
 * builds inputs from invoices, payment history, and EmailEvent engagement, and
 * the recommended tone feeds straight into generateSmartReminderDraft.
 */

import type { ReminderTone } from "./smart-reminder-drafts";

export type CollectionRiskBand = "low" | "moderate" | "high" | "severe";

export type CollectionAction =
  | "monitor" // nothing due yet, reliable payer — leave alone
  | "pre_due_nudge" // upcoming due date + elevated risk — gentle heads-up
  | "reminder" // just overdue — standard reminder
  | "firm_reminder" // persistently overdue or ignored — firmer follow-up
  | "final_notice" // far overdue / high balance — final notice before escalation
  | "escalate"; // exhausted reminders with no engagement — human/phone/collections

export interface CollectionRiskInput {
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  balance: number;
  /** Days until due; negative means overdue by that many days. */
  daysUntilDue: number;
  /** Client on-time payment percentage, or null when there isn't enough history. */
  clientOnTimePercent: number | null;
  /** Client average days late across paid invoices. */
  clientAvgDaysLate: number;
  /** Whether the client clears the org's reliable-payer threshold. */
  isReliablePayer: boolean;
  /** Reminder emails already sent for this invoice. */
  remindersSent: number;
  /** Whether the most recent invoice email was opened. */
  invoiceOpened: boolean;
  /** Whether a payment link in the invoice email was clicked. */
  invoiceClicked: boolean;
}

export interface CollectionRiskScore {
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  balance: number;
  daysOverdue: number;
  /** 0-100 probability the invoice will be (or already is) paid late. */
  lateRiskPercent: number;
  band: CollectionRiskBand;
  recommendedAction: CollectionAction;
  recommendedTone: ReminderTone;
  /** Whether action is recommended now (vs. monitor). */
  actionDue: boolean;
  reasons: string[];
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function bandFor(risk: number): CollectionRiskBand {
  if (risk >= 75) return "severe";
  if (risk >= 50) return "high";
  if (risk >= 30) return "moderate";
  return "low";
}

function baseHistoryRisk(input: CollectionRiskInput): { risk: number; reasons: string[] } {
  const reasons: string[] = [];
  if (input.clientOnTimePercent === null) {
    reasons.push("No payment history yet — using a neutral baseline.");
    return { risk: 40, reasons };
  }
  let risk = 100 - input.clientOnTimePercent;
  reasons.push(`Client pays on time ${input.clientOnTimePercent}% of the time.`);
  if (input.clientAvgDaysLate > 0) {
    risk += clamp(input.clientAvgDaysLate * 1.5, 0, 25);
    reasons.push(`Averages ${round(input.clientAvgDaysLate)} days late.`);
  }
  if (input.isReliablePayer) {
    risk -= 15;
    reasons.push("Flagged as a reliable payer.");
  }
  return { risk: clamp(risk), reasons };
}

export function scoreCollectionRisk(input: CollectionRiskInput): CollectionRiskScore {
  const daysOverdue = Math.max(0, -input.daysUntilDue);
  const { risk: historyRisk, reasons } = baseHistoryRisk(input);
  let risk = historyRisk;

  // Overdue pressure: risk climbs steeply as an invoice ages past due.
  if (daysOverdue > 0) {
    risk += clamp(daysOverdue * 1.5, 0, 45);
    reasons.push(`${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue.`);
  }

  // Engagement signals. A clicked-but-unpaid invoice means intent to pay (lower
  // risk); a sent-but-never-opened overdue invoice means it's being ignored
  // (higher risk).
  if (input.remindersSent > 0 || daysOverdue > 0) {
    if (input.invoiceClicked && daysOverdue <= 7) {
      risk -= 10;
      reasons.push("Payment link was clicked — likely intends to pay.");
    } else if (!input.invoiceOpened && daysOverdue > 3) {
      risk += 12;
      reasons.push("Invoice email was never opened.");
    } else if (input.invoiceOpened && !input.invoiceClicked && daysOverdue > 3) {
      risk += 6;
      reasons.push("Opened but no payment-link click yet.");
    }
  }

  // Reminder fatigue: each ignored reminder past the first nudges risk up.
  if (input.remindersSent >= 2 && daysOverdue > 0) {
    risk += clamp((input.remindersSent - 1) * 6, 0, 18);
    reasons.push(`${input.remindersSent} reminders already sent.`);
  }

  const lateRiskPercent = round(clamp(risk));
  const band = bandFor(lateRiskPercent);
  const { action, tone } = recommendAction(input, daysOverdue, band);

  return {
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    clientId: input.clientId,
    clientName: input.clientName,
    balance: round(input.balance),
    daysOverdue,
    lateRiskPercent,
    band,
    recommendedAction: action,
    recommendedTone: tone,
    actionDue: action !== "monitor",
    reasons,
  };
}

function recommendAction(
  input: CollectionRiskInput,
  daysOverdue: number,
  band: CollectionRiskBand,
): { action: CollectionAction; tone: ReminderTone } {
  // Not yet due.
  if (daysOverdue === 0 && input.daysUntilDue > 0) {
    // Only nudge a not-yet-due invoice when the client is risky and the due
    // date is close — never pre-nudge a reliable payer.
    if (!input.isReliablePayer && (band === "high" || band === "severe") && input.daysUntilDue <= 5) {
      return { action: "pre_due_nudge", tone: "helpful" };
    }
    return { action: "monitor", tone: "helpful" };
  }

  // Reminders exhausted with no engagement → hand off to a human.
  if (input.remindersSent >= 3 && !input.invoiceClicked && (band === "high" || band === "severe")) {
    return { action: "escalate", tone: "firm" };
  }

  // Escalation ladder by how overdue the invoice is, intensified by risk band.
  if (daysOverdue >= 30 || (daysOverdue >= 21 && band === "severe")) {
    return { action: "final_notice", tone: "firm" };
  }
  if (daysOverdue >= 8 || band === "severe") {
    return { action: "firm_reminder", tone: "firm" };
  }
  if (daysOverdue >= 1) {
    return { action: "reminder", tone: band === "high" ? "firm" : "professional" };
  }
  return { action: "monitor", tone: "helpful" };
}

/**
 * Rank open invoices by collection risk so the dunning queue surfaces the
 * invoices most likely to go (or stay) unpaid first. Monitor-only invoices
 * sort to the bottom.
 */
export function prioritizeCollections(inputs: CollectionRiskInput[]): CollectionRiskScore[] {
  return inputs
    .map(scoreCollectionRisk)
    .sort((a, b) => {
      if (a.actionDue !== b.actionDue) return a.actionDue ? -1 : 1;
      return b.lateRiskPercent - a.lateRiskPercent || b.balance - a.balance;
    });
}
