-- CreateEnum
CREATE TYPE "TriageCategory" AS ENUM ('PROMISE_TO_PAY', 'DISPUTE', 'QUESTION', 'INFO_UPDATE', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "InboundEmailTriage" (
    "id" TEXT NOT NULL,
    "inboundEmailId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" "TriageCategory" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT NOT NULL,
    "promisedDate" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InboundEmailTriage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboundEmailTriage_inboundEmailId_key" ON "InboundEmailTriage"("inboundEmailId");
CREATE INDEX "InboundEmailTriage_organizationId_isDismissed_createdAt_idx" ON "InboundEmailTriage"("organizationId", "isDismissed", "createdAt");

-- AddForeignKey
ALTER TABLE "InboundEmailTriage" ADD CONSTRAINT "InboundEmailTriage_inboundEmailId_fkey" FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboundEmailTriage" ADD CONSTRAINT "InboundEmailTriage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
