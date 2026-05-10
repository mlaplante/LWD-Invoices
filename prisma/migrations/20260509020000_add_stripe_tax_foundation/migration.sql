-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "stripeTaxEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "stripeTaxCalculationId" TEXT;

-- CreateTable
CREATE TABLE "InvoiceLineStripeTaxBreakdown" (
    "id" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "jurisdictionDisplay" TEXT NOT NULL,
    "jurisdictionLevel" TEXT NOT NULL,
    "amount" DECIMAL(20, 4) NOT NULL,
    "taxableAmount" DECIMAL(20, 4) NOT NULL,
    "rateDecimal" DECIMAL(8, 4) NOT NULL,
    "taxType" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLineStripeTaxBreakdown_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceLineStripeTaxBreakdown_invoiceLineId_idx"
  ON "InvoiceLineStripeTaxBreakdown" ("invoiceLineId");

-- AddForeignKey
ALTER TABLE "InvoiceLineStripeTaxBreakdown"
  ADD CONSTRAINT "InvoiceLineStripeTaxBreakdown_invoiceLineId_fkey"
  FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
