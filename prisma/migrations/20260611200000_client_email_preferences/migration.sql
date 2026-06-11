-- CreateEnum
CREATE TYPE "EmailPreferenceKind" AS ENUM ('PAYMENT_REMINDERS', 'PROPOSAL_NUDGES', 'AUTOMATIONS');

-- AlterTable: add the public email-preferences token, backfilled for existing rows
ALTER TABLE "Client" ADD COLUMN "emailPreferencesToken" TEXT;
UPDATE "Client" SET "emailPreferencesToken" = gen_random_uuid()::text WHERE "emailPreferencesToken" IS NULL;
ALTER TABLE "Client" ALTER COLUMN "emailPreferencesToken" SET NOT NULL;

-- CreateTable
CREATE TABLE "ClientEmailPreference" (
    "id" TEXT NOT NULL,
    "kind" "EmailPreferenceKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "clientId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientEmailPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_emailPreferencesToken_key" ON "Client"("emailPreferencesToken");

-- CreateIndex
CREATE UNIQUE INDEX "ClientEmailPreference_clientId_kind_key" ON "ClientEmailPreference"("clientId", "kind");

-- CreateIndex
CREATE INDEX "ClientEmailPreference_organizationId_idx" ON "ClientEmailPreference"("organizationId");

-- AddForeignKey
ALTER TABLE "ClientEmailPreference" ADD CONSTRAINT "ClientEmailPreference_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientEmailPreference" ADD CONSTRAINT "ClientEmailPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
