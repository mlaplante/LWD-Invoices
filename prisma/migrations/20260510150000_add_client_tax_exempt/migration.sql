-- Tax-exempt flag for clients (e.g. nonprofits, intercompany transfers).
-- Default false preserves existing behavior.

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "isTaxExempt" BOOLEAN NOT NULL DEFAULT false;
