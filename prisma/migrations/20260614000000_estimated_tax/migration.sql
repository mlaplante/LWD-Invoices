-- AlterTable: estimated quarterly tax (self-employment set-aside) settings
ALTER TABLE "Organization" ADD COLUMN     "estimatedTaxEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "estimatedTaxSetAsidePercent" DECIMAL(5,2) NOT NULL DEFAULT 30,
ADD COLUMN     "estimatedTaxReminderDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "estimatedTaxReminderLastSentAt" TIMESTAMP(3);
