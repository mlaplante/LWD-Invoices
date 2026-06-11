-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "earlyPayDiscountEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "earlyPayDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "earlyPayDiscountDays" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "earlyPayDiscountPercent" DECIMAL(5,2),
ADD COLUMN     "earlyPayDiscountDays" INTEGER,
ADD COLUMN     "earlyPayDiscountRedeemedAt" TIMESTAMP(3),
ADD COLUMN     "earlyPayDiscountAmount" DECIMAL(20,10) NOT NULL DEFAULT 0;
