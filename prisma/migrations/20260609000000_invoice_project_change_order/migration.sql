-- Link invoices to projects and mark change orders.
-- Adds nullable projectId FK (ON DELETE SET NULL), isChangeOrder boolean,
-- and a composite index on (organizationId, projectId).

ALTER TABLE "Invoice" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "isChangeOrder" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Invoice_organizationId_projectId_idx" ON "Invoice"("organizationId", "projectId");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
