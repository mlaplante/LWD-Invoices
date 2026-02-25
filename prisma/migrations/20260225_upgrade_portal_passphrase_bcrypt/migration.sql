-- Upgrade portal passphrase storage from plain text to bcrypt
-- This migration:
--   1. Adds Client.portalPassphraseHash (bcrypt) replacing Client.portalPassphrase (plain text)
--   2. Removes Invoice.portalPassphraseHash (never populated; auth now uses Client hash via relation)
--
-- All existing passphrases are dropped — users will need to re-set them.
-- Portal access is unaffected for invoices without a passphrase.

-- Add bcrypt hash column to Client
ALTER TABLE "Client" ADD COLUMN "portalPassphraseHash" TEXT;

-- Drop the plain-text passphrase column from Client
ALTER TABLE "Client" DROP COLUMN "portalPassphrase";

-- Drop the per-invoice hash column (was never populated; auth now uses Client.portalPassphraseHash)
ALTER TABLE "Invoice" DROP COLUMN "portalPassphraseHash";
