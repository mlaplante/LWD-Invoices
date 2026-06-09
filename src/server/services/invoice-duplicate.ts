/**
 * Invoice duplicate detection.
 *
 * The sibling of `expense-anomaly.ts`, but for the invoicing side: when a user
 * is creating a new invoice, warn if it looks like one they already issued —
 * same client, a near-identical amount, within a recent window. This catches
 * the "accidentally billed the same work twice" case before the invoice goes
 * out.
 *
 * Pure function (`detectInvoiceDuplicate`) so it's unit-testable without a DB;
 * the router pulls the candidate's recent same-client invoices from Prisma and
 * feeds them in.
 */

export interface DuplicateCandidate {
  clientId: string;
  /** The candidate invoice's total. */
  amount: number;
  /** Issue date of the candidate (defaults to "now" at the call site). */
  issueDate: Date;
}

export interface ExistingInvoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  amount: number;
  issueDate: Date;
}

export interface DuplicateMatch {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  issueDate: string;
  /** Absolute days between the candidate and this existing invoice. */
  daysApart: number;
  /** How far the existing amount is from the candidate, as a percent (0 = exact). */
  amountDeltaPercent: number;
  severity: "warning" | "danger";
  message: string;
}

export interface InvoiceDuplicateResult {
  matches: DuplicateMatch[];
}

export interface DetectInvoiceDuplicateOptions {
  /** Max days between issue dates for two invoices to be considered related. */
  windowDays?: number;
  /** An existing invoice matches when its amount is within this percent of the candidate. */
  amountTolerancePercent?: number;
}

const DAY_MS = 86_400_000;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function detectInvoiceDuplicate(
  candidate: DuplicateCandidate,
  existing: ExistingInvoice[],
  options: DetectInvoiceDuplicateOptions = {},
): InvoiceDuplicateResult {
  const windowDays = options.windowDays ?? 30;
  const tolerancePercent = options.amountTolerancePercent ?? 5;

  const matches: DuplicateMatch[] = [];

  for (const inv of existing) {
    if (inv.clientId !== candidate.clientId) continue;

    const daysApart = Math.abs(
      (candidate.issueDate.getTime() - inv.issueDate.getTime()) / DAY_MS,
    );
    if (daysApart > windowDays) continue;

    // Compare against the candidate amount; guard against a zero candidate.
    const base = candidate.amount === 0 ? 1 : Math.abs(candidate.amount);
    const amountDeltaPercent = round((Math.abs(inv.amount - candidate.amount) / base) * 100);
    if (amountDeltaPercent > tolerancePercent) continue;

    // Exact amount within a tight window is the classic double-bill — danger.
    // A near (within-tolerance) amount is suspicious but worth only a warning.
    const severity: DuplicateMatch["severity"] =
      amountDeltaPercent === 0 ? "danger" : "warning";

    const roundedDays = Math.round(daysApart);
    matches.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      amount: round(inv.amount),
      issueDate: inv.issueDate.toISOString(),
      daysApart: roundedDays,
      amountDeltaPercent,
      severity,
      message:
        `Invoice ${inv.invoiceNumber} for $${round(inv.amount).toLocaleString("en-US")} ` +
        `to this client was issued ${roundedDays === 0 ? "today" : `${roundedDays} day${roundedDays === 1 ? "" : "s"} ago`}` +
        `${amountDeltaPercent === 0 ? " for the same amount" : ` for a near-identical amount`} — possible duplicate.`,
    });
  }

  // Closest match first: smallest amount delta, then fewest days apart.
  matches.sort(
    (a, b) => a.amountDeltaPercent - b.amountDeltaPercent || a.daysApart - b.daysApart,
  );

  return { matches };
}
