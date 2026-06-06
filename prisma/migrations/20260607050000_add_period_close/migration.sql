-- Month-end close: one period-close record per (org, year, month). Closing the
-- month freezes the full reconciliation/anomaly/adjustment report into snapshot
-- and locks the period (advisory). Reopening preserves the snapshot.

CREATE TYPE "PeriodCloseStatus" AS ENUM ('CLOSED', 'REOPENED');

CREATE TABLE "PeriodClose" (
    "id" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "status" "PeriodCloseStatus" NOT NULL DEFAULT 'CLOSED',
    "invoiced" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "collected" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "refunded" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "expenses" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "netCash" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "adjustmentCount" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB NOT NULL,
    "notes" TEXT,
    "closedByUserId" TEXT,
    "closedByLabel" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reopenedByUserId" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodClose_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PeriodClose_organizationId_periodYear_periodMonth_key" ON "PeriodClose"("organizationId", "periodYear", "periodMonth");
CREATE INDEX "PeriodClose_organizationId_periodYear_periodMonth_idx" ON "PeriodClose"("organizationId", "periodYear", "periodMonth");

ALTER TABLE "PeriodClose" ADD CONSTRAINT "PeriodClose_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
