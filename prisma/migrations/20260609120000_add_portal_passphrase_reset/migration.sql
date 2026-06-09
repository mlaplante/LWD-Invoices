-- Self-service "forgot passphrase" reset for the client portal.
-- Stores the SHA-256 of the emailed reset token (never the plaintext) plus
-- its expiry. Cleared on successful reset.

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "portalPassphraseResetTokenHash" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "portalPassphraseResetExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Client_portalPassphraseResetTokenHash_key"
  ON "Client"("portalPassphraseResetTokenHash");
