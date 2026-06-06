-- 1099 / Contractor Tax Pack: track contractor payments, collect W-9 data, and
-- generate Form 1099-NEC at year end.

-- ── Enums ─────────────────────────────────────────────────────────────────────
CREATE TYPE "W9Status" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'RECEIVED');
CREATE TYPE "ContractorTinType" AS ENUM ('SSN', 'EIN');
CREATE TYPE "ContractorPaymentMethod" AS ENUM ('CHECK', 'ACH', 'WIRE', 'CASH', 'CARD', 'THIRD_PARTY', 'OTHER');

-- ── Payer Tax ID on the organization (printed on generated 1099-NEC forms) ─────
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "payerTin" TEXT;

-- ── Contractor (payee + W-9 identity) ─────────────────────────────────────────
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "businessName" TEXT,
    "taxClassification" TEXT,
    "tinType" "ContractorTinType",
    "tinEncrypted" TEXT,
    "tinLast4" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "country" TEXT DEFAULT 'US',
    "w9Status" "W9Status" NOT NULL DEFAULT 'NOT_REQUESTED',
    "w9DocumentPath" TEXT,
    "w9ReceivedAt" TIMESTAMP(3),
    "exemptFrom1099" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Contractor_organizationId_isArchived_idx" ON "Contractor"("organizationId", "isArchived");

ALTER TABLE "Contractor"
  ADD CONSTRAINT "Contractor_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── ContractorPayment (per-payment ledger) ────────────────────────────────────
CREATE TABLE "ContractorPayment" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(20,10) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" "ContractorPaymentMethod" NOT NULL DEFAULT 'CHECK',
    "memo" TEXT,
    "reference" TEXT,
    "reportable" BOOLEAN NOT NULL DEFAULT true,
    "expenseId" TEXT,
    "contractorId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContractorPayment_organizationId_paidAt_idx" ON "ContractorPayment"("organizationId", "paidAt");
CREATE INDEX "ContractorPayment_contractorId_idx" ON "ContractorPayment"("contractorId");

ALTER TABLE "ContractorPayment"
  ADD CONSTRAINT "ContractorPayment_contractorId_fkey"
  FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractorPayment"
  ADD CONSTRAINT "ContractorPayment_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
