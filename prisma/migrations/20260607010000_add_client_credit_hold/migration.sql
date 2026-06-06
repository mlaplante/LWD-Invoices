-- Credit limit / credit hold per client. creditHold is advisory (warn-only):
-- the UI surfaces a prominent warning before sending/charging but never hard-blocks.
-- An auto-hold (creditHoldAuto) is placed by the health-score trigger and released
-- automatically when the score recovers; manual holds are released by an admin.
ALTER TABLE "Client" ADD COLUMN "creditLimit" DECIMAL(20,2);
ALTER TABLE "Client" ADD COLUMN "creditHold" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN "creditHoldReason" TEXT;
ALTER TABLE "Client" ADD COLUMN "creditHoldSetAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "creditHoldAuto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN "autoCreditHoldEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN "autoCreditHoldThreshold" INTEGER;
