-- Additional CC recipients for invoice + receipt emails.

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "ccEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
