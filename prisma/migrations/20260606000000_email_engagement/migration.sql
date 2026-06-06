-- Email engagement features: link email tracking events to invoices and add a
-- "viewed but unpaid" reminder-step trigger.

-- 1. Reminder step trigger type
CREATE TYPE "ReminderStepTrigger" AS ENUM ('DUE_DATE_OFFSET', 'VIEWED_UNPAID');

ALTER TABLE "ReminderStep"
  ADD COLUMN "trigger" "ReminderStepTrigger" NOT NULL DEFAULT 'DUE_DATE_OFFSET',
  ADD COLUMN "viewedDelayHours" INTEGER;

-- 2. Associate email tracking events with a specific invoice
ALTER TABLE "EmailEvent" ADD COLUMN "invoiceId" TEXT;

CREATE INDEX "EmailEvent_invoiceId_occurredAt_idx" ON "EmailEvent"("invoiceId", "occurredAt");

ALTER TABLE "EmailEvent"
  ADD CONSTRAINT "EmailEvent_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
