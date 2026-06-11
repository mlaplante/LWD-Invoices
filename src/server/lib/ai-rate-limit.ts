import { TRPCError } from "@trpc/server";
import { createRateLimiter } from "@/lib/rate-limit";

/**
 * Per-org budget caps for LLM-backed procedures.
 *
 * Every feature that spends external AI tokens on demand must pass through
 * `assertAiRateLimit` so one org (or one compromised session) can't run up
 * the model bill. Mirrors the existing per-route limiters on receipt OCR,
 * invoice draft-from-prompt, and the assistant stream — this is the shared
 * home for the rest.
 *
 * In-process like the rest of `@/lib/rate-limit`: the effective ceiling
 * multiplies with replica count, which is acceptable for a cost cap (the
 * point is stopping unbounded spend, not exact quotas).
 */
const limiters = {
  // Reminder drafting fires one model call per invoice; bursts happen when
  // working a collections queue, so allow a generous-but-bounded window.
  reminderDraft: createRateLimiter({ limit: 30, windowMs: 10 * 60_000 }),
  // Proposal generation is the most expensive call (template + past
  // proposals + item catalog in the prompt).
  proposalGeneration: createRateLimiter({ limit: 15, windowMs: 10 * 60_000 }),
  invoiceReview: createRateLimiter({ limit: 30, windowMs: 10 * 60_000 }),
  expenseCategorization: createRateLimiter({ limit: 60, windowMs: 10 * 60_000 }),
} as const;

export type AiFeature = keyof typeof limiters;

export function assertAiRateLimit(feature: AiFeature, orgId: string): void {
  if (limiters[feature].isLimited(orgId)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "AI request limit reached for your organization. Please try again in a few minutes.",
    });
  }
}
