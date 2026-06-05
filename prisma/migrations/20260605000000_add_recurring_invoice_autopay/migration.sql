-- Add card-on-file autopay controls and attempt tracking for recurring invoices.

CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "RecurringInvoice" ADD COLUMN "autoCharge" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PaymentAttempt" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'AUTOPAY',
  "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(20,10) NOT NULL,
  "method" TEXT NOT NULL,
  "processor" TEXT,
  "processorId" TEXT,
  "processorError" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "invoiceId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "savedPaymentMethodId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentAttempt_idempotencyKey_key" ON "PaymentAttempt"("idempotencyKey");
CREATE UNIQUE INDEX "PaymentAttempt_invoiceId_kind_key" ON "PaymentAttempt"("invoiceId", "kind");
CREATE INDEX "PaymentAttempt_organizationId_status_idx" ON "PaymentAttempt"("organizationId", "status");
CREATE INDEX "PaymentAttempt_invoiceId_idx" ON "PaymentAttempt"("invoiceId");

ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_savedPaymentMethodId_fkey"
  FOREIGN KEY ("savedPaymentMethodId") REFERENCES "SavedPaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
