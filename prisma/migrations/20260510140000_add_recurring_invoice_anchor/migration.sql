-- Day-of-month anchor + IANA timezone for recurring invoices. Null on
-- existing rows preserves current behavior (startDate-relative + UTC).

ALTER TABLE "RecurringInvoice" ADD COLUMN IF NOT EXISTS "dayOfMonth" INTEGER;
ALTER TABLE "RecurringInvoice" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
