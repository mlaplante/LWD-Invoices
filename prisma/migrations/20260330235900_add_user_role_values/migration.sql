-- Add new values to UserRole enum
-- These must commit before they can be referenced in the same transaction.
-- Split into its own migration to satisfy PostgreSQL's enum usage constraints (P3006).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'VIEWER';
