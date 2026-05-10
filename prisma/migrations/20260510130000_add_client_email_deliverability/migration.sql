-- Track Resend bounce / complaint events on the Client so we can suppress
-- further sends and surface the issue in the UI.

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "emailBouncedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "emailComplainedAt" TIMESTAMP(3);
