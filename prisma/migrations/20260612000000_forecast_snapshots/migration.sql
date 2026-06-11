-- CreateTable
CREATE TABLE "ForecastSnapshot" (
    "id" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "horizonDays" INTEGER NOT NULL,
    "matureAt" TIMESTAMP(3) NOT NULL,
    "projectedInflow" DECIMAL(20,2) NOT NULL,
    "projectedOutflow" DECIMAL(20,2) NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "actualInflow" DECIMAL(20,2),
    "scoredAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ForecastSnapshot_organizationId_capturedAt_idx" ON "ForecastSnapshot"("organizationId", "capturedAt");

-- CreateIndex
CREATE INDEX "ForecastSnapshot_scoredAt_matureAt_idx" ON "ForecastSnapshot"("scoredAt", "matureAt");

-- AddForeignKey
ALTER TABLE "ForecastSnapshot" ADD CONSTRAINT "ForecastSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
