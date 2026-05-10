-- Track Resend bounce / complaint events on the Client so we can suppress
-- further sends and surface the issue in the UI.

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "emailBouncedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "emailComplainedAt" TIMESTAMP(3);
