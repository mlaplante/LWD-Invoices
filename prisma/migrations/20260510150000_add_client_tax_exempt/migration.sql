-- Tax-exempt flag for clients (e.g. nonprofits, intercompany transfers).
-- Default false preserves existing behavior.

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "isTaxExempt" BOOLEAN NOT NULL DEFAULT false;
