-- Make projectId optional on Expense and add paidAt and reimbursable fields

-- Add new columns
ALTER TABLE "Expense" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Expense" ADD COLUMN "reimbursable" BOOLEAN NOT NULL DEFAULT false;

-- Make projectId nullable
ALTER TABLE "Expense" ALTER COLUMN "projectId" DROP NOT NULL;

-- Drop old required foreign key constraint and re-add (projectId is now nullable, cascade still applies)
ALTER TABLE "Expense" DROP CONSTRAINT IF EXISTS "Expense_projectId_fkey";
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
