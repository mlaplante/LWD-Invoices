-- Inbound email threading: capture client replies (routed via a
-- reply+<invoiceId>@<inbound-domain> Reply-To) and thread them onto the
-- invoice and a support ticket.

CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "subject" TEXT,
    "bodyText" TEXT,
    "messageId" TEXT,
    "inReplyTo" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "clientId" TEXT,
    "ticketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InboundEmail_organizationId_receivedAt_idx" ON "InboundEmail"("organizationId", "receivedAt");
CREATE INDEX "InboundEmail_invoiceId_idx" ON "InboundEmail"("invoiceId");
CREATE INDEX "InboundEmail_messageId_idx" ON "InboundEmail"("messageId");

ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
