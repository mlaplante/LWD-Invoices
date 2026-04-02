-- AlterTable: Organization — add defaultPaymentTermsDays and paymentReminderDays
ALTER TABLE "Organization" ADD COLUMN "defaultPaymentTermsDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Organization" ADD COLUMN "paymentReminderDays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 3]::INTEGER[];

-- AlterTable: Client — add defaultPaymentTermsDays (nullable)
ALTER TABLE "Client" ADD COLUMN "defaultPaymentTermsDays" INTEGER;

-- AlterTable: Invoice — add reminderDaysOverride
ALTER TABLE "Invoice" ADD COLUMN "reminderDaysOverride" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
