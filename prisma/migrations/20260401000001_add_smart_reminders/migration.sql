ALTER TABLE "Organization" ADD COLUMN "smartRemindersEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "smartRemindersThreshold" INTEGER NOT NULL DEFAULT 80;
