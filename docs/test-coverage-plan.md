# Test Coverage Improvement Plan

**Goal:** Achieve 80% code coverage by adding tests for high-value, untested modules

**Date:** Feb 26, 2026
**Priority:** High-value services that impact business logic

---

## Phase 1: Fix Existing Test Failures (BLOCKING)

### Task 1.1: Fix estimate-route.test.ts env var validation
- **Issue:** Test file fails on import due to env var validation in lib/env.ts
- **Solution:** Add .env.test with all required env vars OR mock env in setup.ts
- **Impact:** Unblocks coverage report generation
- **Est. Lines:** ~10-20

### Task 1.2: Fix stripe-webhook.test.ts email mock
- **Issue:** Payment receipt email fails due to undefined customer.email
- **Solution:** Improve mock customer object with full email field
- **Impact:** Prevents email errors in webhook tests
- **Est. Lines:** ~5-10

---

## Phase 2: Core Service Tests (High Priority)

### Task 2.1: Tax Calculator Tests
- **File:** src/server/services/tax-calculator.ts
- **Lines of Code:** 189
- **Complexity:** HIGH - compound/non-compound tax logic, discounts
- **Test Coverage Needed:**
  - `calculateLineTotals()` - basic line calculations
  - `calculateLineTotals()` - item-level discounts (% and fixed)
  - `calculateLineTotals()` - period types (PERIOD_MONTH, etc.)
  - `calculateLineTotals()` - non-compound taxes
  - `calculateLineTotals()` - compound taxes
  - `calculateLineTotals()` - mixed compound/non-compound
  - `calculateInvoiceTotals()` - multiple lines
  - `calculateInvoiceTotals()` - percentage discounts at invoice level
  - `calculateInvoiceTotals()` - fixed discounts at invoice level
  - Edge cases: zero discounts, zero taxes, large numbers
- **Est. Test Lines:** 150-200 lines

### Task 2.2: Encryption Service Tests
- **File:** src/server/services/encryption.ts
- **Lines of Code:** 47
- **Complexity:** MEDIUM - crypto operations, format validation
- **Test Coverage Needed:**
  - `encryptJson()` - basic object encryption
  - `decryptJson()` - basic decryption
  - `encryptJson()` → `decryptJson()` - round-trip
  - Error handling: invalid format, wrong key, corrupted ciphertext
  - Type preservation: arrays, nested objects, special values
- **Est. Test Lines:** 80-100 lines

### Task 2.3: Invoice Numbering Tests
- **File:** src/server/services/invoice-numbering.ts
- **Lines of Code:** 28
- **Complexity:** MEDIUM - database atomic operation
- **Test Coverage Needed:**
  - Format validation (PREFIX-YYYY-0001)
  - Atomicity with concurrent calls
  - Year rollover handling
  - Prefix handling
- **Est. Test Lines:** 60-80 lines

### Task 2.4: Utility Function Tests
- **File:** src/lib/utils.ts
- **Lines of Code:** 13
- **Complexity:** LOW - pure functions
- **Test Coverage Needed:**
  - `cn()` - class name merging with tailwind merge
  - `formatBytes()` - B, KB, MB conversions
  - `formatBytes()` - edge cases (0, 1023, 1024, etc.)
- **Est. Test Lines:** 40-60 lines

---

## Phase 3: Additional Service Tests (Medium Priority)

### Task 3.1: Gateway Config Service Tests
- **File:** src/server/services/gateway-config.ts
- **Lines of Code:** ~120 (estimate)
- **Complexity:** MEDIUM - config validation and formatting
- **Est. Test Lines:** 80-100 lines

### Task 3.2: Audit Service Tests
- **File:** src/server/services/audit.ts
- **Lines of Code:** ~100 (estimate)
- **Complexity:** MEDIUM - audit logging
- **Est. Test Lines:** 60-80 lines

### Task 3.3: Notification Service Tests
- **File:** src/server/services/notifications.ts
- **Lines of Code:** ~150 (estimate)
- **Complexity:** MEDIUM - multi-channel notifications
- **Est. Test Lines:** 100-120 lines

### Task 3.4: Storage Service Tests
- **File:** src/server/services/storage.ts
- **Lines of Code:** ~150 (estimate)
- **Complexity:** MEDIUM - cloud storage operations
- **Est. Test Lines:** 100-120 lines

---

## Phase 4: Hook & Utility Tests (Medium Priority)

### Task 4.1: use-mobile Hook Tests
- **File:** src/hooks/use-mobile.ts
- **Complexity:** LOW - responsive hook
- **Est. Test Lines:** 30-50 lines

### Task 4.2: Email Component Snapshot Tests
- **Files:** src/emails/*.tsx
- **Complexity:** LOW - snapshot testing
- **Est. Test Lines:** 60-100 lines

---

## Phase 5: Critical Router Tests (Lower Priority - Complex)

### Task 5.1: Priority Router Tests
Focus on high-volume routes:
- `invoices.ts` - core business logic
- `clients.ts` - customer management
- `reports.ts` - analytics
- `expenses.ts` - expense tracking
- `projects.ts` - project management

Each router needs:
- Basic CRUD operation tests
- Authorization checks
- Input validation
- Error cases

- **Est. Test Lines per Router:** 150-250 lines
- **Total for 5 routers:** 750-1250 lines

---

## Test Template

Use this template for new test files:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { someFunction } from "@/path/to/module";

describe("Module Name", () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  describe("specific function", () => {
    it("should handle the happy path", () => {
      // Arrange
      const input = { /* ... */ };

      // Act
      const result = someFunction(input);

      // Assert
      expect(result).toBe(expectedValue);
    });

    it("should handle error cases", () => {
      // ...
    });
  });
});
```

---

## Success Criteria

- [ ] All 11 test files pass without errors
- [ ] Coverage report generates successfully
- [ ] Coverage statements ≥ 80%
- [ ] Coverage branches ≥ 75%
- [ ] Coverage functions ≥ 80%
- [ ] All critical business logic has tests
- [ ] No critical security functions untested

---

## Estimated Effort

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1 (Fix failures) | 2-3 hours | 🔴 CRITICAL |
| Phase 2 (Core services) | 6-8 hours | 🔴 HIGH |
| Phase 3 (Additional services) | 4-5 hours | 🟠 MEDIUM |
| Phase 4 (Hooks/Utilities) | 2-3 hours | 🟡 LOW |
| Phase 5 (Routers) | 8-12 hours | 🟡 LOW |
| **Total** | **22-31 hours** | |

**Quick wins to 80%:** Focus on Phases 1-2 only (~8-11 hours)
