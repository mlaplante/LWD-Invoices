-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN "amount" DECIMAL(20,10),
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "autoInvoice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "invoiceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_invoiceId_key" ON "Milestone"("invoiceId");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
