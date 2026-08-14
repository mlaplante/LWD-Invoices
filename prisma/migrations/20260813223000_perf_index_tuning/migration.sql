-- Index tuning from the 2026-08-13 performance audit (findings 7 and 9).
--
-- Every index here is also declared in schema.prisma with the same columns, so
-- `prisma migrate dev` sees no drift. Index names match Prisma's default
-- `<Table>_<col>_<col>_idx` convention deliberately — a hand-picked name would
-- read as drift and get dropped-and-recreated on the next generated migration.
--
-- Note on locking: these are plain CREATE INDEX, not CONCURRENTLY, matching the
-- existing convention in this folder. Prisma wraps a migration in a transaction
-- and CONCURRENTLY cannot run inside one. The tables below are small (templates,
-- proposals, discussions, late-fee entries, recurring schedules, tasks), so the
-- brief ACCESS EXCLUSIVE lock is acceptable. If any of these grows large, build
-- the index out-of-band with CONCURRENTLY and add it here as IF NOT EXISTS.

-- ── Finding 7: org-scoped reads with no usable index ────────────────────────
-- Chosen from actual query shapes in src/server, not from "every model should
-- have an organizationId index". Comment was deliberately skipped: its reads
-- filter on invoiceId, which is already indexed.

-- where { organizationId } orderBy createdAt desc  (+ organizationId prefix
-- covers the `isDefault` default-template lookup)
CREATE INDEX IF NOT EXISTS "ProposalTemplate_organizationId_createdAt_idx"
  ON "ProposalTemplate" ("organizationId", "createdAt");

-- where { organizationId, ... } orderBy createdAt desc
CREATE INDEX IF NOT EXISTS "ProposalContent_organizationId_createdAt_idx"
  ON "ProposalContent" ("organizationId", "createdAt");

-- scheduler sweep: where { organizationId, isActive: true }
CREATE INDEX IF NOT EXISTS "RecurringInvoice_organizationId_isActive_idx"
  ON "RecurringInvoice" ("organizationId", "isActive");

-- both reads filter on projectId (the selective column)
CREATE INDEX IF NOT EXISTS "Discussion_projectId_idx"
  ON "Discussion" ("projectId");

-- per-invoice reads; invoiceId is NOT unique here (many entries per invoice).
--
-- Guarded, unlike the others: "LateFeeEntry" is one of seven tables that exist
-- in schema.prisma but are never CREATE TABLE'd by any migration in this folder
-- (see finding 11 in docs/reviews/2026-08-13-performance-audit.md). Against
-- production that is harmless — the table is there. Against a database built
-- only from this migration folder (a `migrate dev` shadow DB, or a from-scratch
-- environment) the table does not exist, and `CREATE INDEX IF NOT EXISTS` still
-- errors on a missing *table*. The existence check keeps this migration
-- replayable in both worlds.
DO $$
BEGIN
  IF to_regclass('"LateFeeEntry"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "LateFeeEntry_invoiceId_idx"
      ON "LateFeeEntry" ("invoiceId");
  END IF;
END $$;

-- org-wide open-task count: where { organizationId, isCompleted: false }.
-- The pre-existing organizationId index on this table is PARTIAL
-- (WHERE "assignedUserId" IS NOT NULL) and cannot serve an unfiltered count.
CREATE INDEX IF NOT EXISTS "ProjectTask_organizationId_isCompleted_idx"
  ON "ProjectTask" ("organizationId", "isCompleted");

-- ── Finding 9: indexes duplicating a unique constraint ──────────────────────
-- A unique btree already serves every lookup and range scan a plain index
-- would, so these were second copies maintained on every insert for no read
-- benefit. ClientPortalSession is written on every portal login.

-- duplicate of the unique index on ClientPortalSession("token")
DROP INDEX IF EXISTS "ClientPortalSession_token_idx";

-- duplicate of "PeriodClose_organizationId_periodYear_periodMonth_key"
DROP INDEX IF EXISTS "PeriodClose_organizationId_periodYear_periodMonth_idx";
