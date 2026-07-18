-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "installmentAutoChargeEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PaymentAttempt" ADD COLUMN "partialPaymentId" TEXT;

-- CreateIndex
CREATE INDEX "PaymentAttempt_partialPaymentId_idx" ON "PaymentAttempt"("partialPaymentId");

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_partialPaymentId_fkey" FOREIGN KEY ("partialPaymentId") REFERENCES "PartialPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
