-- No-code automation builder: generalizes the fixed EmailAutomation +
-- ReminderSequence features into composable trigger → conditions → actions
-- rules. AutomationRun records each (rule, invoice) execution at most once,
-- mirroring EmailAutomationLog's double-send guard.

-- New notification type for the NOTIFY_ADMINS automation action.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AUTOMATION_TRIGGERED';

CREATE TYPE "AutomationTrigger" AS ENUM ('PAYMENT_RECEIVED', 'INVOICE_SENT', 'INVOICE_VIEWED', 'INVOICE_OVERDUE');
CREATE TYPE "AutomationConditionField" AS ENUM ('TOTAL', 'AMOUNT_DUE', 'DAYS_OVERDUE', 'STATUS', 'CLIENT_NAME', 'CURRENCY_CODE');
CREATE TYPE "AutomationOperator" AS ENUM ('EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'CONTAINS', 'NOT_CONTAINS');
CREATE TYPE "AutomationConditionLogic" AS ENUM ('AND', 'OR');
CREATE TYPE "AutomationActionType" AS ENUM ('SEND_EMAIL', 'NOTIFY_ADMINS');

CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "conditionLogic" "AutomationConditionLogic" NOT NULL DEFAULT 'AND',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationCondition" (
    "id" TEXT NOT NULL,
    "field" "AutomationConditionField" NOT NULL,
    "operator" "AutomationOperator" NOT NULL,
    "value" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "ruleId" TEXT NOT NULL,

    CONSTRAINT "AutomationCondition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationAction" (
    "id" TEXT NOT NULL,
    "type" "AutomationActionType" NOT NULL,
    "config" JSONB NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "ruleId" TEXT NOT NULL,

    CONSTRAINT "AutomationAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'executed',
    "actionsRun" INTEGER NOT NULL DEFAULT 0,
    "detail" TEXT,
    "ruleId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationRule_organizationId_trigger_enabled_idx" ON "AutomationRule"("organizationId", "trigger", "enabled");
CREATE INDEX "AutomationCondition_ruleId_idx" ON "AutomationCondition"("ruleId");
CREATE INDEX "AutomationAction_ruleId_idx" ON "AutomationAction"("ruleId");
CREATE UNIQUE INDEX "AutomationRun_ruleId_invoiceId_key" ON "AutomationRun"("ruleId", "invoiceId");
CREATE INDEX "AutomationRun_ruleId_createdAt_idx" ON "AutomationRun"("ruleId", "createdAt");
CREATE INDEX "AutomationRun_invoiceId_idx" ON "AutomationRun"("invoiceId");

ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationCondition" ADD CONSTRAINT "AutomationCondition_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
