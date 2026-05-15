-- Client Retention / Check-In Automation
-- Adds a surfaced queue of relationship touches the admin reviews weekly,
-- per-org enable flag with a cutoff so first-run doesn't backfill history,
-- and per-touch-type message templates.

-- New NotificationType value
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RETENTION_QUEUE_READY';

-- New enums
CREATE TYPE "ClientCheckInTouchType" AS ENUM ('PROJECT_CLOSE', 'THIRTY_DAY', 'QUARTERLY', 'ANNUAL');
CREATE TYPE "ClientCheckInStatus" AS ENUM ('PENDING', 'DISMISSED', 'COMPLETED');
CREATE TYPE "ClientCheckInOutcome" AS ENUM ('NEW_WORK', 'REFERRAL', 'NOTHING');

-- Organization feature flag + cutoff
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "retentionEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "retentionEnabledAt" TIMESTAMP(3);

-- ClientCheckIn table
CREATE TABLE "ClientCheckIn" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "touchType" "ClientCheckInTouchType" NOT NULL,
    "status" "ClientCheckInStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "outcome" "ClientCheckInOutcome",
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientCheckIn_organizationId_status_dueAt_idx" ON "ClientCheckIn"("organizationId", "status", "dueAt");
CREATE INDEX "ClientCheckIn_clientId_touchType_idx" ON "ClientCheckIn"("clientId", "touchType");
CREATE INDEX "ClientCheckIn_organizationId_touchType_status_idx" ON "ClientCheckIn"("organizationId", "touchType", "status");

ALTER TABLE "ClientCheckIn" ADD CONSTRAINT "ClientCheckIn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientCheckIn" ADD CONSTRAINT "ClientCheckIn_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientCheckIn" ADD CONSTRAINT "ClientCheckIn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckInTemplate table
CREATE TABLE "CheckInTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "touchType" "ClientCheckInTouchType" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckInTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CheckInTemplate_organizationId_touchType_key" ON "CheckInTemplate"("organizationId", "touchType");

ALTER TABLE "CheckInTemplate" ADD CONSTRAINT "CheckInTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
