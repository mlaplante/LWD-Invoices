-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "mileageRatePerMile" DECIMAL(10,4) NOT NULL DEFAULT 0.70;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "scheduledSendAt" TIMESTAMP(3),
ADD COLUMN     "scheduledSendCc" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ExpenseBudget" (
    "id" TEXT NOT NULL,
    "monthlyAmount" DECIMAL(20,10) NOT NULL,
    "categoryId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MileageEntry" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "miles" DECIMAL(10,2) NOT NULL,
    "ratePerMile" DECIMAL(10,4) NOT NULL,
    "description" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "roundTrip" BOOLEAN NOT NULL DEFAULT false,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MileageEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseBudget_organizationId_categoryId_key" ON "ExpenseBudget"("organizationId", "categoryId");

-- CreateIndex
CREATE INDEX "MileageEntry_organizationId_date_idx" ON "MileageEntry"("organizationId", "date");

-- CreateIndex
CREATE INDEX "Invoice_scheduledSendAt_idx" ON "Invoice"("scheduledSendAt");

-- AddForeignKey
ALTER TABLE "ExpenseBudget" ADD CONSTRAINT "ExpenseBudget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseBudget" ADD CONSTRAINT "ExpenseBudget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MileageEntry" ADD CONSTRAINT "MileageEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MileageEntry" ADD CONSTRAINT "MileageEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

