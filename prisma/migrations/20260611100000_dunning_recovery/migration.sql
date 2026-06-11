-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "dunningEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "dunningEscalatedAt" TIMESTAMP(3);
