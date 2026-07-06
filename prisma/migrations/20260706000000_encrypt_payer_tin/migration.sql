-- AlterTable
-- Add AES-GCM-encrypted payer TIN columns (mirrors Contractor.tinEncrypted/tinLast4).
-- The legacy plaintext "payerTin" column is intentionally retained for now so
-- existing rows keep working until scripts/backfill-payer-tin.ts re-encrypts them;
-- a follow-up migration drops "payerTin" once the backfill has run in production.
ALTER TABLE "Organization" ADD COLUMN "payerTinEncrypted" TEXT,
ADD COLUMN "payerTinLast4" TEXT;
