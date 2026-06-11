/**
 * Dunning / failed-payment recovery.
 *
 * When an off-session auto-charge fails, the invoice used to just sit unpaid.
 * Dunning closes the loop: re-attempt the charge on a fixed schedule after the
 * initial failure, and when retries are exhausted (or the failure can't be
 * fixed by retrying — no/expired payment method) escalate to a client email
 * with the pay link plus an admin notification.
 *
 * Retry idempotency rides on PaymentAttempt's (invoiceId, kind) unique
 * constraint: each retry slot is its own kind (DUNNING_RETRY_1..N), so a
 * duplicated cron run can never double-charge. Escalation is terminal and
 * recorded as Invoice.dunningEscalatedAt.
 */

export const DUNNING_RETRY_OFFSETS_DAYS = [1, 3, 7] as const;
export const DUNNING_RETRY_KINDS = ["DUNNING_RETRY_1", "DUNNING_RETRY_2", "DUNNING_RETRY_3"] as const;

export type DunningAttempt = {
  kind: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  processorError: string | null;
  // failAttempt always stamps completedAt; attemptedAt covers PENDING rows.
  completedAt: Date | null;
  attemptedAt: Date;
};

export type DunningAction =
  | { type: "RETRY"; kind: (typeof DUNNING_RETRY_KINDS)[number] }
  | { type: "ESCALATE" }
  | { type: "WAIT" }
  | { type: "NONE" };

/**
 * Failures a charge retry could plausibly fix (temporary declines,
 * insufficient funds, processor hiccups). Setup problems — nothing on file,
 * expired card — need the client to act, so retrying is pointless.
 */
export function isRetryableFailure(reason: string | null): boolean {
  if (!reason) return true;
  const nonRetryable = [
    "No Stripe customer on file",
    "No saved payment method on file",
    "Saved payment method is expired",
    "Stripe gateway is not enabled",
  ];
  return !nonRetryable.some((m) => reason.includes(m));
}

/**
 * Decide the next dunning step for an invoice from its PaymentAttempt history.
 * Pure so the schedule is unit-testable independent of the cron.
 */
export function nextDunningAction(attempts: DunningAttempt[], now: Date): DunningAction {
  // Any successful attempt means the money landed — nothing to do. (The cron
  // also filters on unpaid status; this guards stale reads.)
  if (attempts.some((a) => a.status === "SUCCEEDED")) return { type: "NONE" };

  const initial = attempts.find((a) => a.kind === "AUTOPAY" && a.status === "FAILED");
  if (!initial) return { type: "NONE" };

  // An in-flight attempt (crash between create and resolution) blocks further
  // action — failAttempt resolves these on the same run that created them, so
  // a lingering PENDING row needs a human, not more charges.
  if (attempts.some((a) => a.kind.startsWith("DUNNING_RETRY_") && a.status === "PENDING")) {
    return { type: "WAIT" };
  }

  if (!isRetryableFailure(initial.processorError)) return { type: "ESCALATE" };

  const retries = attempts.filter((a) => a.kind.startsWith("DUNNING_RETRY_"));
  if (retries.length >= DUNNING_RETRY_KINDS.length) return { type: "ESCALATE" };

  // A retry that failed for a non-retryable reason short-circuits the rest of
  // the schedule (e.g. the card expired between retries).
  const lastRetry = retries
    .slice()
    .sort((a, b) => a.attemptedAt.getTime() - b.attemptedAt.getTime())
    .at(-1);
  if (lastRetry?.processorError && !isRetryableFailure(lastRetry.processorError)) {
    return { type: "ESCALATE" };
  }

  const initialFailedAt = initial.completedAt ?? initial.attemptedAt;
  const offsetDays = DUNNING_RETRY_OFFSETS_DAYS[retries.length];
  const dueAt = new Date(initialFailedAt.getTime() + offsetDays * 24 * 60 * 60_000);
  if (now < dueAt) return { type: "WAIT" };

  return { type: "RETRY", kind: DUNNING_RETRY_KINDS[retries.length] };
}
