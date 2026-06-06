-- Proposal engagement: a "viewed but not signed" nudge for estimates/proposals,
-- mirroring the invoice "viewed but unpaid" reminder. The open/click tracking
-- data itself already flows through the existing EmailEvent.invoiceId link
-- (estimates send via the same tagged path as invoices).

-- 1. One-nudge-per-proposal guard (mirrors ReminderLog's double-send guard).
ALTER TABLE "ProposalContent" ADD COLUMN "nudgeSentAt" TIMESTAMP(3);

-- 2. Per-org feature flag + delay for the proposal nudge.
ALTER TABLE "Organization"
  ADD COLUMN "proposalNudgeEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "proposalNudgeDelayHours" INTEGER NOT NULL DEFAULT 48;
