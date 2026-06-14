-- CreateTable
CREATE TABLE "EstimatedTaxPayment" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimatedTaxPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EstimatedTaxPayment_organizationId_year_idx" ON "EstimatedTaxPayment"("organizationId", "year");

-- AddForeignKey
ALTER TABLE "EstimatedTaxPayment" ADD CONSTRAINT "EstimatedTaxPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
