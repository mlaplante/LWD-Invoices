-- B2.1: Signature fields on Invoice + SignatureAuditLog model

-- Add e-signature fields to Invoice
ALTER TABLE "Invoice" ADD COLUMN "signedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "signedByName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "signedByEmail" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "signedByIp" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "signatureData" TEXT;

-- SignatureAuditLog table
CREATE TABLE "SignatureAuditLog" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "signedByName" TEXT NOT NULL,
    "signedByEmail" TEXT NOT NULL,
    "signedByIp" TEXT NOT NULL,
    "userAgent" TEXT,
    "documentHash" TEXT NOT NULL,
    "signatureHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignatureAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SignatureAuditLog_invoiceId_idx" ON "SignatureAuditLog"("invoiceId");
CREATE INDEX "SignatureAuditLog_organizationId_idx" ON "SignatureAuditLog"("organizationId");

ALTER TABLE "SignatureAuditLog" ADD CONSTRAINT "SignatureAuditLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
