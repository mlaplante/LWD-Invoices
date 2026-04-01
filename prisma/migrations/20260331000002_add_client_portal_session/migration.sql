-- B1.1: ClientPortalSession model

CREATE TABLE "ClientPortalSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPortalSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientPortalSession_token_key" ON "ClientPortalSession"("token");
CREATE INDEX "ClientPortalSession_token_idx" ON "ClientPortalSession"("token");
CREATE INDEX "ClientPortalSession_clientId_idx" ON "ClientPortalSession"("clientId");
CREATE INDEX "ClientPortalSession_expiresAt_idx" ON "ClientPortalSession"("expiresAt");

ALTER TABLE "ClientPortalSession" ADD CONSTRAINT "ClientPortalSession_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
