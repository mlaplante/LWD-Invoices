-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "snoozedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_organizationId_userId_snoozedUntil_idx"
  ON "Notification" ("organizationId", "userId", "snoozedUntil");
