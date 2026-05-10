-- Compound indexes for hot dashboard / reports / payment-reconciliation paths.
-- Each filter is org-scoped, so the leading column is always organizationId.
--
-- IF NOT EXISTS guards make this safe to re-run if a previous attempt
-- partially succeeded or got marked failed in _prisma_migrations.

CREATE INDEX IF NOT EXISTS "Invoice_organizationId_status_idx"
  ON "Invoice"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "Invoice_organizationId_isArchived_idx"
  ON "Invoice"("organizationId", "isArchived");

CREATE INDEX IF NOT EXISTS "Invoice_organizationId_dueDate_idx"
  ON "Invoice"("organizationId", "dueDate");

CREATE INDEX IF NOT EXISTS "Payment_organizationId_paidAt_idx"
  ON "Payment"("organizationId", "paidAt");

CREATE INDEX IF NOT EXISTS "Payment_invoiceId_idx"
  ON "Payment"("invoiceId");

CREATE INDEX IF NOT EXISTS "PartialPayment_invoiceId_isPaid_idx"
  ON "PartialPayment"("invoiceId", "isPaid");
