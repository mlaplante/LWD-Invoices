-- AlterEnum
ALTER TYPE "InvoiceType" ADD VALUE 'DEPOSIT';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "creditBalance" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "creditApplied" DECIMAL(65,30) NOT NULL DEFAULT 0;
