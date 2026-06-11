import { describe, it, expect } from "vitest";
import {
  nextDunningAction,
  isRetryableFailure,
  type DunningAttempt,
} from "@/server/services/dunning";

const T0 = new Date("2026-06-01T00:00:00Z");

function daysAfter(days: number): Date {
  return new Date(T0.getTime() + days * 24 * 60 * 60_000);
}

function attempt(over: Partial<DunningAttempt> & { kind: string }): DunningAttempt {
  return {
    status: "FAILED",
    processorError: "Your card was declined.",
    completedAt: T0,
    attemptedAt: T0,
    ...over,
  };
}

describe("isRetryableFailure", () => {
  it("treats card declines and unknown errors as retryable", () => {
    expect(isRetryableFailure("Your card was declined.")).toBe(true);
    expect(isRetryableFailure("insufficient_funds")).toBe(true);
    expect(isRetryableFailure(null)).toBe(true);
  });

  it("treats setup problems as non-retryable", () => {
    expect(isRetryableFailure("No Stripe customer on file")).toBe(false);
    expect(isRetryableFailure("No saved payment method on file")).toBe(false);
    expect(isRetryableFailure("Saved payment method is expired")).toBe(false);
    expect(isRetryableFailure("Stripe gateway is not enabled")).toBe(false);
  });
});

describe("nextDunningAction", () => {
  it("does nothing without a failed AUTOPAY attempt", () => {
    expect(nextDunningAction([], T0)).toEqual({ type: "NONE" });
    expect(
      nextDunningAction([attempt({ kind: "AUTOPAY", status: "SUCCEEDED", processorError: null })], T0),
    ).toEqual({ type: "NONE" });
  });

  it("does nothing once any attempt has succeeded", () => {
    const attempts = [
      attempt({ kind: "AUTOPAY" }),
      attempt({ kind: "DUNNING_RETRY_1", status: "SUCCEEDED", processorError: null }),
    ];
    expect(nextDunningAction(attempts, daysAfter(10))).toEqual({ type: "NONE" });
  });

  it("waits until the first retry offset (1 day) has passed", () => {
    const attempts = [attempt({ kind: "AUTOPAY" })];
    expect(nextDunningAction(attempts, daysAfter(0.5))).toEqual({ type: "WAIT" });
    expect(nextDunningAction(attempts, daysAfter(1))).toEqual({ type: "RETRY", kind: "DUNNING_RETRY_1" });
  });

  it("schedules retries 2 and 3 at +3 and +7 days from the initial failure", () => {
    const base = [attempt({ kind: "AUTOPAY" })];

    const afterOne = [...base, attempt({ kind: "DUNNING_RETRY_1", attemptedAt: daysAfter(1) })];
    expect(nextDunningAction(afterOne, daysAfter(2))).toEqual({ type: "WAIT" });
    expect(nextDunningAction(afterOne, daysAfter(3))).toEqual({ type: "RETRY", kind: "DUNNING_RETRY_2" });

    const afterTwo = [...afterOne, attempt({ kind: "DUNNING_RETRY_2", attemptedAt: daysAfter(3) })];
    expect(nextDunningAction(afterTwo, daysAfter(5))).toEqual({ type: "WAIT" });
    expect(nextDunningAction(afterTwo, daysAfter(7))).toEqual({ type: "RETRY", kind: "DUNNING_RETRY_3" });
  });

  it("escalates after all retries fail", () => {
    const attempts = [
      attempt({ kind: "AUTOPAY" }),
      attempt({ kind: "DUNNING_RETRY_1", attemptedAt: daysAfter(1) }),
      attempt({ kind: "DUNNING_RETRY_2", attemptedAt: daysAfter(3) }),
      attempt({ kind: "DUNNING_RETRY_3", attemptedAt: daysAfter(7) }),
    ];
    expect(nextDunningAction(attempts, daysAfter(8))).toEqual({ type: "ESCALATE" });
  });

  it("escalates immediately on non-retryable initial failures", () => {
    const attempts = [attempt({ kind: "AUTOPAY", processorError: "No saved payment method on file" })];
    expect(nextDunningAction(attempts, daysAfter(0))).toEqual({ type: "ESCALATE" });
  });

  it("escalates when a retry hits a non-retryable failure mid-schedule", () => {
    const attempts = [
      attempt({ kind: "AUTOPAY" }),
      attempt({
        kind: "DUNNING_RETRY_1",
        attemptedAt: daysAfter(1),
        processorError: "Saved payment method is expired",
      }),
    ];
    expect(nextDunningAction(attempts, daysAfter(3))).toEqual({ type: "ESCALATE" });
  });

  it("waits while a retry attempt is still PENDING", () => {
    const attempts = [
      attempt({ kind: "AUTOPAY" }),
      attempt({ kind: "DUNNING_RETRY_1", status: "PENDING", processorError: null, completedAt: null, attemptedAt: daysAfter(1) }),
    ];
    expect(nextDunningAction(attempts, daysAfter(5))).toEqual({ type: "WAIT" });
  });
});
