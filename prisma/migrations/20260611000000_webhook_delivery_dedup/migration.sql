-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_provider_externalId_key" ON "WebhookDelivery"("provider", "externalId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_processedAt_idx" ON "WebhookDelivery"("processedAt");
