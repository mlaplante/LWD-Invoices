-- Self-service contractor portal: per-contractor opt-in flag + an opaque bearer
-- token for the public portal URL (mirrors the client invoice portal token).

ALTER TABLE "Contractor" ADD COLUMN IF NOT EXISTS "portalEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contractor" ADD COLUMN IF NOT EXISTS "portalToken" TEXT;

-- Backfill existing rows with a unique token before enforcing NOT NULL + UNIQUE.
UPDATE "Contractor" SET "portalToken" = gen_random_uuid()::text WHERE "portalToken" IS NULL;

ALTER TABLE "Contractor" ALTER COLUMN "portalToken" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Contractor_portalToken_key" ON "Contractor"("portalToken");
