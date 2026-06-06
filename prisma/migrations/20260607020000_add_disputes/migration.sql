-- Disputes / chargebacks. Mirrored from charge.dispute.* webhook events and
-- progressed via the disputes router (evidence submission). The source invoice
-- is never auto-mutated — a dispute can be won and re-charged.

-- Extend NotificationType for dispute/refund/credit-hold in-app notifications.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISPUTE_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISPUTE_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REFUND_ISSUED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CREDIT_HOLD_PLACED';

CREATE TYPE "DisputeStatus" AS ENUM ('NEEDS_RESPONSE', 'UNDER_REVIEW', 'WON', 'LOST', 'WARNING_CLOSED', 'CHARGE_REFUNDED', 'CLOSED');

CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "stripeDisputeId" TEXT NOT NULL,
    "stripeChargeId" TEXT,
    "paymentIntentId" TEXT,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'NEEDS_RESPONSE',
    "stripeStatus" TEXT NOT NULL,
    "evidenceDueBy" TIMESTAMP(3),
    "evidenceSubmittedAt" TIMESTAMP(3),
    "isRefundable" BOOLEAN NOT NULL DEFAULT true,
    "internalNotes" TEXT,
    "paymentId" TEXT,
    "invoiceId" TEXT,
    "clientId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Dispute_stripeDisputeId_key" ON "Dispute"("stripeDisputeId");
CREATE INDEX "Dispute_organizationId_status_idx" ON "Dispute"("organizationId", "status");
CREATE INDEX "Dispute_organizationId_createdAt_idx" ON "Dispute"("organizationId", "createdAt");
CREATE INDEX "Dispute_invoiceId_idx" ON "Dispute"("invoiceId");

ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
