-- Dashboard/report aggregate indexes. On fresh databases Prisma runs this in
-- the normal migration transaction. For existing production DBs that need
-- zero-lock index builds, apply prisma/perf-indexes.sql with psql first, then
-- mark this migration resolved.

CREATE INDEX IF NOT EXISTS "Payment_organizationId_invoiceId_idx" ON "Payment" ("organizationId", "invoiceId");
CREATE INDEX IF NOT EXISTS "Expense_organizationId_createdAt_idx" ON "Expense" ("organizationId", "createdAt");
