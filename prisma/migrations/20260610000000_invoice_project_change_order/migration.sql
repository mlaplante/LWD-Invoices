-- Link invoices to projects and mark change orders.
-- Adds nullable projectId FK (ON DELETE SET NULL), isChangeOrder boolean,
-- and a composite index on (organizationId, projectId).

-- IF NOT EXISTS guards mirror the repo's other hand-authored migrations so the
-- file is safe to re-run if a previous attempt partially succeeded.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "isChangeOrder" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Invoice_organizationId_projectId_idx" ON "Invoice"("organizationId", "projectId");

-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS; guard with a DO block instead
-- (same pattern as the add_hours_retainers migration).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_projectId_fkey'
  ) THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
