-- CreateEnum
CREATE TYPE "HoursRetainerResetInterval" AS ENUM ('MONTHLY');

-- CreateEnum
CREATE TYPE "HoursRetainerPeriodStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- AlterTable
ALTER TABLE "TimeEntry"
  ALTER COLUMN "projectId" DROP NOT NULL,
  ADD COLUMN "retainerId" TEXT,
  ADD COLUMN "retainerPeriodId" TEXT;

-- CreateTable
CREATE TABLE "HoursRetainer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "includedHours" DECIMAL(16,8) NOT NULL,
    "resetInterval" "HoursRetainerResetInterval",
    "hourlyRate" DECIMAL(20,10),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HoursRetainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoursRetainerPeriod" (
    "id" TEXT NOT NULL,
    "retainerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "includedHoursSnapshot" DECIMAL(16,8) NOT NULL,
    "status" "HoursRetainerPeriodStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HoursRetainerPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HoursRetainer_organizationId_clientId_idx" ON "HoursRetainer"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "HoursRetainerPeriod_retainerId_status_idx" ON "HoursRetainerPeriod"("retainerId", "status");

-- CreateIndex
CREATE INDEX "TimeEntry_retainerId_idx" ON "TimeEntry"("retainerId");

-- CreateIndex
CREATE INDEX "TimeEntry_retainerPeriodId_idx" ON "TimeEntry"("retainerPeriodId");

-- AddForeignKey
ALTER TABLE "HoursRetainer"
  ADD CONSTRAINT "HoursRetainer_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoursRetainer"
  ADD CONSTRAINT "HoursRetainer_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoursRetainerPeriod"
  ADD CONSTRAINT "HoursRetainerPeriod_retainerId_fkey"
  FOREIGN KEY ("retainerId") REFERENCES "HoursRetainer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry"
  ADD CONSTRAINT "TimeEntry_retainerId_fkey"
  FOREIGN KEY ("retainerId") REFERENCES "HoursRetainer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry"
  ADD CONSTRAINT "TimeEntry_retainerPeriodId_fkey"
  FOREIGN KEY ("retainerPeriodId") REFERENCES "HoursRetainerPeriod"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Note: TimeEntry.projectId FK was already ON DELETE CASCADE in init migration.
-- Drop and recreate to be explicit and ensure correctness after making projectId nullable.
ALTER TABLE "TimeEntry" DROP CONSTRAINT IF EXISTS "TimeEntry_projectId_fkey";
ALTER TABLE "TimeEntry"
  ADD CONSTRAINT "TimeEntry_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce exactly one of (projectId, retainerId) on TimeEntry.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TimeEntry_exactly_one_of_project_or_retainer'
  ) THEN
    ALTER TABLE "TimeEntry"
    ADD CONSTRAINT "TimeEntry_exactly_one_of_project_or_retainer"
    CHECK (
      ("projectId" IS NOT NULL AND "retainerId" IS NULL)
      OR
      ("projectId" IS NULL AND "retainerId" IS NOT NULL)
    );
  END IF;
END
$$;

-- Enforce at most one ACTIVE period per retainer.
CREATE UNIQUE INDEX IF NOT EXISTS "HoursRetainerPeriod_one_active_per_retainer"
  ON "HoursRetainerPeriod"("retainerId")
  WHERE "status" = 'ACTIVE';
