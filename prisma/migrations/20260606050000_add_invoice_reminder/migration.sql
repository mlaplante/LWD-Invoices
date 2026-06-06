-- Ad-hoc (manual) reminder sends, e.g. the one-click "Send reminder" in Smart
-- Collections. Not tied to a sequence step (unlike ReminderLog); feeds the
-- collections risk model's remindersSent / last-reminded signals.

CREATE TABLE "InvoiceReminder" (
    "id" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subject" TEXT NOT NULL,
    "tone" TEXT,
    "source" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "invoiceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceReminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoiceReminder_invoiceId_sentAt_idx" ON "InvoiceReminder"("invoiceId", "sentAt");
CREATE INDEX "InvoiceReminder_organizationId_sentAt_idx" ON "InvoiceReminder"("organizationId", "sentAt");

ALTER TABLE "InvoiceReminder" ADD CONSTRAINT "InvoiceReminder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceReminder" ADD CONSTRAINT "InvoiceReminder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
