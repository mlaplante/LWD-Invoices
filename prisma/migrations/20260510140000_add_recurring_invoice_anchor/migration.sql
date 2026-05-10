-- Day-of-month anchor + IANA timezone for recurring invoices. Null on
-- existing rows preserves current behavior (startDate-relative + UTC).

-- AlterTable
ALTER TABLE "RecurringInvoice" ADD COLUMN "dayOfMonth" INTEGER;
ALTER TABLE "RecurringInvoice" ADD COLUMN "timezone" TEXT;
