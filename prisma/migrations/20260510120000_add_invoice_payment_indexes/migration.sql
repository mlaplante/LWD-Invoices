-- Compound indexes for hot dashboard / reports / payment-reconciliation paths.
-- Each filter is org-scoped, so the leading column is always organizationId.

-- CreateIndex
CREATE INDEX "Invoice_organizationId_status_idx" ON "Invoice"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_isArchived_idx" ON "Invoice"("organizationId", "isArchived");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_dueDate_idx" ON "Invoice"("organizationId", "dueDate");

-- CreateIndex
CREATE INDEX "Payment_organizationId_paidAt_idx" ON "Payment"("organizationId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "PartialPayment_invoiceId_isPaid_idx" ON "PartialPayment"("invoiceId", "isPaid");
