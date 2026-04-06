-- CreateTable
CREATE TABLE "SavedPaymentMethod" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripePaymentMethodId" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "expiresMonth" INTEGER NOT NULL,
    "expiresYear" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavedPaymentMethod_stripePaymentMethodId_key" ON "SavedPaymentMethod"("stripePaymentMethodId");

-- CreateIndex
CREATE INDEX "SavedPaymentMethod_clientId_organizationId_idx" ON "SavedPaymentMethod"("clientId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPaymentMethod_clientId_organizationId_stripePaymentMethodId_key" ON "SavedPaymentMethod"("clientId", "organizationId", "stripePaymentMethodId");

-- AddForeignKey
ALTER TABLE "SavedPaymentMethod" ADD CONSTRAINT "SavedPaymentMethod_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPaymentMethod" ADD CONSTRAINT "SavedPaymentMethod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
