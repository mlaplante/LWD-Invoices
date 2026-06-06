-- Weekly AI business briefing: proactive Monday email composing overdue total,
-- at-risk clients, and the projected cash position. Off by default per org.
ALTER TABLE "Organization" ADD COLUMN "weeklyBriefingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "weeklyBriefingRecipients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Organization" ADD COLUMN "weeklyBriefingLastSentAt" TIMESTAMP(3);
