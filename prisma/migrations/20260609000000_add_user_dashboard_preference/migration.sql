-- CreateTable
CREATE TABLE "UserDashboardPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "layoutJson" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDashboardPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserDashboardPreference_organizationId_idx" ON "UserDashboardPreference"("organizationId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "UserDashboardPreference_userId_organizationId_key" ON "UserDashboardPreference"("userId", "organizationId");

-- AddForeignKey
ALTER TABLE "UserDashboardPreference" ADD CONSTRAINT "UserDashboardPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
