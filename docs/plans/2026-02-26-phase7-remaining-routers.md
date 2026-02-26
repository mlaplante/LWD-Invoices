# Phase 7: Remaining Routers Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add comprehensive tests for high-impact untested routers (auditLog, recurringInvoices, partialPayments, timeTracking, currencies, items, gatewaySettings) to reach 50%+ overall coverage.

**Architecture:** Create router procedure tests for all CRUD operations using established mock tRPC context pattern. Test business logic, error handling, filtering, authorization, and domain-specific validation.

**Tech Stack:** Vitest, Prisma Client (mocked), tRPC v11, TypeScript

---

## Priority Routers for Phase 7

Ordered by business impact and coverage gain potential:

1. **auditLog** - Audit logging queries and filtering
2. **recurringInvoices** - Complex recurring business logic
3. **partialPayments** - Critical payment feature
4. **timeEntries** + **timers** - Time tracking core
5. **currencies** - Configuration and validation
6. **items** - Line item templates
7. **gatewaySettings** - Payment gateway management

---

## Task 1: Audit Log Router Tests

**Files:**
- Create: `src/test/routers-auditlog-procedures.test.ts`

**Implementation:**

Create tests for auditLog router with procedures:
- list: filters by entityType, entityId, dateRange, action
- get: retrieve single audit log entry
- Tests for pagination, sorting by date, organization isolation

**Tests:** 8 tests
**Commit:** "test: add auditlog router procedure tests"

---

## Task 2: Recurring Invoices Router Tests

**Files:**
- Create: `src/test/routers-recurringinvoices-procedures.test.ts`

**Implementation:**

Create tests for recurringInvoices router with procedures:
- list: filters by client, status, active/inactive
- get: retrieve recurring invoice with full details
- create: create new recurring invoice with schedule validation
- update: modify recurring invoice settings
- Tests for schedule validation, next billing date calculation, client relationship

**Tests:** 12 tests
**Commit:** "test: add recurring invoices router procedure tests"

---

## Task 3: Partial Payments Router Tests

**Files:**
- Create: `src/test/routers-partialpayments-procedures.test.ts`

**Implementation:**

Create tests for partialPayments router with procedures:
- list: filters by invoice, dateRange, status
- get: retrieve partial payment with transaction details
- create: create partial payment with amount validation
- Tests for: amount validation (cannot exceed invoice balance), invoice relationship, payment status transitions

**Tests:** 10 tests
**Commit:** "test: add partial payments router procedure tests"

---

## Task 4: Time Tracking Router Tests

**Files:**
- Create: `src/test/routers-timeentries-procedures.test.ts`
- Create: `src/test/routers-timesheets-procedures.test.ts`

**Implementation:**

**timeEntries tests (8 tests):**
- list: filters by project, user, dateRange, billable status
- get: retrieve time entry with project details
- create: create time entry with duration validation
- update: modify time entry and recalculate billable amount
- Tests for: duration calculation, billable rate application, project relationship

**timesheets tests (6 tests):**
- list: filters by user, period, status
- get: retrieve timesheet with aggregated hours
- Tests for: hour aggregation, approval workflow, status validation

**Tests:** 14 tests combined
**Commit:** "test: add time tracking router procedure tests"

---

## Task 5: Currencies and Items Router Tests

**Files:**
- Create: `src/test/routers-currencies-items-procedures.test.ts`

**Implementation:**

**currencies tests (6 tests):**
- list: all available currencies
- Tests for: exchange rate validation, currency code format

**items tests (8 tests):**
- list: line item templates with optional filtering
- get: retrieve item with tax configuration
- create: create new item with price validation
- update: modify item details
- Tests for: price validation, tax rate application, item reusability

**Tests:** 14 tests combined
**Commit:** "test: add currencies and items router procedure tests"

---

## Task 6: Gateway Settings Router Tests

**Files:**
- Create: `src/test/routers-gatewaysettings-procedures.test.ts`

**Implementation:**

Create tests for gatewaySettings router with procedures:
- get: retrieve organization's gateway settings
- update: update payment gateway configuration
- Tests for: encryption of sensitive config, validation of gateway credentials, organization isolation

**Tests:** 8 tests
**Commit:** "test: add gateway settings router procedure tests"

---

## Task 7: Additional Router Coverage

**Files:**
- Create: `src/test/routers-additional-coverage.test.ts`

**Implementation:**

Cover remaining routers with basic CRUD tests:
- attachments: upload, list, delete
- comments: create, list, delete
- discussions: create, list, update
- expenseCategories: list, get, create, update
- expenseSuppliers: list, get, create
- milestones: list, create, update
- notifications: list, read, delete
- portal: client portal access tests
- projectTemplates: list, use template
- taskStatuses: list, get
- taxes: list, get
- tickets: list, create, update
- timers: start, stop, pause

**Tests:** 40+ tests covering basic operations for 13 routers
**Commit:** "test: add additional router coverage for remaining routers"

---

## Task 8: Final Coverage Verification

**Files:**
- All new router test files

**Steps:**

1. Run complete test suite:
   ```bash
   npm run test
   ```
   Expected: 650+ tests passing (from 592)

2. Generate coverage report:
   ```bash
   npm run test -- --coverage
   ```
   Expected: Coverage improved to 40-50%+ (from 33.89%)

3. Verify metrics:
   - Total tests: 650+ (↑58+ from 592)
   - Test files: 45+ (↑8+ new files)
   - Overall coverage: 40-50%+
   - All passing

4. Final commit:
   ```bash
   git commit -m "test: phase 7 remaining routers testing complete - 650+ tests, 40-50% coverage"
   ```

---

## Summary

**What Gets Built:**
- 8 new comprehensive test files for high-impact routers
- 100+ new router procedure tests
- Complete coverage of remaining business logic
- Full CRUD testing for all routers

**Expected Coverage:**
- Total tests: 650+ (↑58 from 592)
- Test files: 45+ (↑8 new)
- Overall coverage: 40-50%+
- Router coverage: Near-complete

**Test Organization:**
- auditlog-procedures.test.ts: 8 tests
- recurringinvoices-procedures.test.ts: 12 tests
- partialpayments-procedures.test.ts: 10 tests
- timeentries-procedures.test.ts: 8 tests
- timesheets-procedures.test.ts: 6 tests
- currencies-items-procedures.test.ts: 14 tests
- gatewaysettings-procedures.test.ts: 8 tests
- additional-coverage.test.ts: 40+ tests

**Time Estimate:** 6-8 hours for full implementation

