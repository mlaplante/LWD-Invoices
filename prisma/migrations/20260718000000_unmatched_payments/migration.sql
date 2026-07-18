-- CreateEnum
CREATE TYPE "UnmatchedPaymentStatus" AS ENUM ('UNMATCHED', 'PARTIALLY_MATCHED', 'MATCHED', 'IGNORED');

-- CreateTable
CREATE TABLE "UnmatchedPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "matchedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "payerName" TEXT,
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "UnmatchedPaymentStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnmatchedPayment_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "unmatchedPaymentId" TEXT;

-- CreateIndex
CREATE INDEX "UnmatchedPayment_organizationId_status_idx" ON "UnmatchedPayment"("organizationId", "status");

-- CreateIndex
CREATE INDEX "UnmatchedPayment_organizationId_receivedAt_idx" ON "UnmatchedPayment"("organizationId", "receivedAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_unmatchedPaymentId_fkey" FOREIGN KEY ("unmatchedPaymentId") REFERENCES "UnmatchedPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnmatchedPayment" ADD CONSTRAINT "UnmatchedPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
