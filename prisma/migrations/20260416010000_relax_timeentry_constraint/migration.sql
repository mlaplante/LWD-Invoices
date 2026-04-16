-- Drop the old exclusive check constraint
ALTER TABLE "TimeEntry"
  DROP CONSTRAINT IF EXISTS "TimeEntry_exactly_one_of_project_or_retainer";

-- Add the relaxed check: at least one of (projectId, retainerId)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TimeEntry_at_least_one_of_project_or_retainer'
  ) THEN
    ALTER TABLE "TimeEntry"
    ADD CONSTRAINT "TimeEntry_at_least_one_of_project_or_retainer"
    CHECK ("projectId" IS NOT NULL OR "retainerId" IS NOT NULL);
  END IF;
END
$$;
