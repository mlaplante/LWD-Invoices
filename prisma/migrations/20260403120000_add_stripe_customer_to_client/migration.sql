-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "autoChargeEnabled" BOOLEAN NOT NULL DEFAULT false;
