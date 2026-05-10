-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "resendId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recipient" TEXT NOT NULL,
    "link" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailEvent_resendId_idx" ON "EmailEvent" ("resendId");

-- CreateIndex
CREATE INDEX "EmailEvent_organizationId_type_occurredAt_idx"
  ON "EmailEvent" ("organizationId", "type", "occurredAt");

-- AddForeignKey
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
