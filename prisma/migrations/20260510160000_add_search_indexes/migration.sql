-- Trigram (pg_trgm) indexes for case-insensitive substring search.
--
-- The global search router uses ILIKE/`contains: insensitive` against
-- invoice.number, client.name, client.email, project.name, expense.name,
-- and ticket.subject. Without these indexes those queries are sequential
-- scans on every keystroke. pg_trgm GIN indexes make ILIKE fast.
--
-- We don't switch to tsvector full-text search here — the search inputs
-- are mostly proper nouns + invoice numbers where token stemming hurts
-- more than it helps (matching "INV-2026-1" via ts_query is awkward).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Invoice_number_trgm_idx"
  ON "Invoice" USING GIN ("number" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Client_name_trgm_idx"
  ON "Client" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Client_email_trgm_idx"
  ON "Client" USING GIN ("email" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Project_name_trgm_idx"
  ON "Project" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Expense_name_trgm_idx"
  ON "Expense" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Ticket_subject_trgm_idx"
  ON "Ticket" USING GIN ("subject" gin_trgm_ops);
