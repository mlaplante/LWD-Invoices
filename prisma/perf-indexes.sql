-- Performance indexes for Pancake v2
-- Safe to run on live DB: CREATE INDEX CONCURRENTLY + IF NOT EXISTS
-- Apply with: psql "$DIRECT_DATABASE_URL" -f prisma/perf-indexes.sql
-- NOTE: CONCURRENTLY cannot run inside a transaction, so we do not wrap this file.
--       Each statement is its own implicit transaction.

-- ─── Invoice ──────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_organizationId_isArchived_status_idx"
  ON "Invoice" ("organizationId", "isArchived", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_organizationId_clientId_idx"
  ON "Invoice" ("organizationId", "clientId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_organizationId_dueDate_idx"
  ON "Invoice" ("organizationId", "dueDate");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_organizationId_date_idx"
  ON "Invoice" ("organizationId", "date");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_organizationId_lastViewed_idx"
  ON "Invoice" ("organizationId", "lastViewed");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_clientId_idx"
  ON "Invoice" ("clientId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_currencyId_idx"
  ON "Invoice" ("currencyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_sourceInvoiceId_idx"
  ON "Invoice" ("sourceInvoiceId") WHERE "sourceInvoiceId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_reminderSequenceId_idx"
  ON "Invoice" ("reminderSequenceId") WHERE "reminderSequenceId" IS NOT NULL;

-- ─── InvoiceLine / InvoiceLineTax ─────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "InvoiceLine_invoiceId_idx"
  ON "InvoiceLine" ("invoiceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "InvoiceLine_sourceTable_sourceId_idx"
  ON "InvoiceLine" ("sourceTable", "sourceId") WHERE "sourceId" IS NOT NULL;

-- ─── Payment ──────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payment_organizationId_paidAt_idx"
  ON "Payment" ("organizationId", "paidAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payment_invoiceId_idx"
  ON "Payment" ("invoiceId");

-- ─── PartialPayment ───────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PartialPayment_invoiceId_isPaid_idx"
  ON "PartialPayment" ("invoiceId", "isPaid");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PartialPayment_organizationId_idx"
  ON "PartialPayment" ("organizationId");

-- ─── TimeEntry ────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TimeEntry_organizationId_date_idx"
  ON "TimeEntry" ("organizationId", "date");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TimeEntry_organizationId_userId_date_idx"
  ON "TimeEntry" ("organizationId", "userId", "date");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TimeEntry_projectId_idx"
  ON "TimeEntry" ("projectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TimeEntry_taskId_idx"
  ON "TimeEntry" ("taskId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TimeEntry_invoiceLineId_idx"
  ON "TimeEntry" ("invoiceLineId") WHERE "invoiceLineId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TimeEntry_organizationId_unbilled_idx"
  ON "TimeEntry" ("organizationId") WHERE "invoiceLineId" IS NULL;

-- ─── Expense ──────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Expense_organizationId_dueDate_idx"
  ON "Expense" ("organizationId", "dueDate");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Expense_organizationId_paidAt_idx"
  ON "Expense" ("organizationId", "paidAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Expense_projectId_idx"
  ON "Expense" ("projectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Expense_categoryId_idx"
  ON "Expense" ("categoryId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Expense_supplierId_idx"
  ON "Expense" ("supplierId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Expense_taxId_idx"
  ON "Expense" ("taxId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Expense_invoiceLineId_idx"
  ON "Expense" ("invoiceLineId") WHERE "invoiceLineId" IS NOT NULL;

-- ─── Project ──────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Project_organizationId_status_idx"
  ON "Project" ("organizationId", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Project_clientId_idx"
  ON "Project" ("clientId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Project_currencyId_idx"
  ON "Project" ("currencyId");

-- ─── Client ───────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Client_organizationId_isArchived_idx"
  ON "Client" ("organizationId", "isArchived");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Client_stripeCustomerId_idx"
  ON "Client" ("stripeCustomerId") WHERE "stripeCustomerId" IS NOT NULL;

-- ─── ProjectTask ──────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProjectTask_projectId_idx"
  ON "ProjectTask" ("projectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProjectTask_milestoneId_idx"
  ON "ProjectTask" ("milestoneId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProjectTask_parentId_idx"
  ON "ProjectTask" ("parentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProjectTask_taskStatusId_idx"
  ON "ProjectTask" ("taskStatusId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProjectTask_organizationId_assignedUserId_idx"
  ON "ProjectTask" ("organizationId", "assignedUserId") WHERE "assignedUserId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProjectTask_invoiceLineId_idx"
  ON "ProjectTask" ("invoiceLineId") WHERE "invoiceLineId" IS NOT NULL;

-- ─── Milestone ────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Milestone_projectId_idx"
  ON "Milestone" ("projectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Milestone_organizationId_idx"
  ON "Milestone" ("organizationId");

-- ─── Timer ────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Timer_organizationId_userId_idx"
  ON "Timer" ("organizationId", "userId");

-- ─── Notification ─────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Notification_organizationId_userId_isRead_createdAt_idx"
  ON "Notification" ("organizationId", "userId", "isRead", "createdAt" DESC);

-- ─── AuditLog ─────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_organizationId_createdAt_idx"
  ON "AuditLog" ("organizationId", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_organizationId_entityType_entityId_idx"
  ON "AuditLog" ("organizationId", "entityType", "entityId");

-- ─── Attachment ───────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Attachment_organizationId_context_contextId_idx"
  ON "Attachment" ("organizationId", "context", "contextId");

-- ─── Ticket ───────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Ticket_organizationId_status_idx"
  ON "Ticket" ("organizationId", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Ticket_clientId_idx"
  ON "Ticket" ("clientId") WHERE "clientId" IS NOT NULL;

-- ─── CreditNoteApplication ────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CreditNoteApplication_creditNoteId_idx"
  ON "CreditNoteApplication" ("creditNoteId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CreditNoteApplication_invoiceId_idx"
  ON "CreditNoteApplication" ("invoiceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CreditNoteApplication_organizationId_idx"
  ON "CreditNoteApplication" ("organizationId");

-- ─── Tax / Currency / Item ────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Tax_organizationId_idx"
  ON "Tax" ("organizationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Item_organizationId_idx"
  ON "Item" ("organizationId");

-- ─── LateFeeEntry / RetainerTransaction / ReminderLog ─────────────────────────
-- (skip — already covered by existing indexes in schema.prisma)

-- ─── SavedPaymentMethod ───────────────────────────────────────────────────────
-- (skip — already has @@index([clientId, organizationId]) in schema)

-- ─── Comment ──────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Comment_invoiceId_idx"
  ON "Comment" ("invoiceId");

-- Done.
