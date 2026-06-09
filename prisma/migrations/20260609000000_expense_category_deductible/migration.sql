-- Adds a per-category deductibility flag used by the tax-ready dashboard.
-- Existing categories default to deductible (the common case); owners mark
-- non-deductible categories (e.g. owner draws) in expense settings.

ALTER TABLE "ExpenseCategory" ADD COLUMN "deductible" BOOLEAN NOT NULL DEFAULT true;
