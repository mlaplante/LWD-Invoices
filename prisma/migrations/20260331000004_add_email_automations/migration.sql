-- B3.1: EmailAutomationTrigger enum + EmailAutomation + EmailAutomationLog models

-- Create enum
CREATE TYPE "EmailAutomationTrigger" AS ENUM ('PAYMENT_RECEIVED', 'INVOICE_SENT', 'INVOICE_VIEWED', 'INVOICE_OVERDUE');

-- EmailAutomation table
CREATE TABLE "EmailAutomation" (
    "id" TEXT NOT NULL,
    "trigger" "EmailAutomationTrigger" NOT NULL,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "templateSubject" TEXT NOT NULL,
    "templateBody" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAutomation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailAutomation_organizationId_trigger_idx" ON "EmailAutomation"("organizationId", "trigger");
CREATE INDEX "EmailAutomation_enabled_idx" ON "EmailAutomation"("enabled");

ALTER TABLE "EmailAutomation" ADD CONSTRAINT "EmailAutomation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EmailAutomationLog table
CREATE TABLE "EmailAutomationLog" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAutomationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailAutomationLog_automationId_idx" ON "EmailAutomationLog"("automationId");
CREATE INDEX "EmailAutomationLog_invoiceId_idx" ON "EmailAutomationLog"("invoiceId");
CREATE UNIQUE INDEX "EmailAutomationLog_automationId_invoiceId_key" ON "EmailAutomationLog"("automationId", "invoiceId");

ALTER TABLE "EmailAutomationLog" ADD CONSTRAINT "EmailAutomationLog_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "EmailAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
