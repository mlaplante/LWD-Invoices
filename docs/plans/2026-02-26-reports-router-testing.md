# Reports Router Procedure Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add integration tests for reports router procedures (unpaidInvoices, overdueInvoices, paymentsByGateway, expenseBreakdown) to reach 50%+ coverage.

**Architecture:** Create comprehensive tests for each reports procedure using the mock tRPC context pattern established in invoices router testing. Test both success paths (return data with filters) and error paths (org not found). Mock database queries to test filter logic and date range handling.

**Tech Stack:** Vitest, Prisma Client (mocked), tRPC v11, TypeScript

---

## Task 1: Set Up Reports Test Scaffold

**Files:**
- Create: `src/test/routers-reports-procedures.test.ts`

**Step 1: Write test file with placeholder tests**

Create `src/test/routers-reports-procedures.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { reportsRouter } from "@/server/routers/reports";
import { createMockContext } from "./mocks/trpc-context";
import { InvoiceStatus } from "@/generated/prisma";

describe("Reports Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = reportsRouter.createCaller(ctx);
  });

  describe("unpaidInvoices", () => {
    it("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("overdueInvoices", () => {
    it("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("paymentsByGateway", () => {
    it("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("expenseBreakdown", () => {
    it("placeholder", () => {
      expect(true).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify scaffold**

Run: `npm run test -- src/test/routers-reports-procedures.test.ts`
Expected: All 4 placeholder tests pass

**Step 3: Commit**

```bash
git add src/test/routers-reports-procedures.test.ts
git commit -m "test: scaffold reports router procedure tests"
```

---

## Task 2: Test unpaidInvoices Procedure - Success Path

**Files:**
- Modify: `src/test/routers-reports-procedures.test.ts`

**Step 1: Write failing test for unpaid invoices with date range**

Add to the `unpaidInvoices` describe block:
```typescript
it("returns invoices with SENT, PARTIALLY_PAID, OVERDUE status", async () => {
  const mockInvoices = [
    {
      id: "inv_1",
      status: InvoiceStatus.SENT,
      isArchived: false,
      organizationId: "test-org-123",
      client: { id: "c_1", name: "Client A", email: "a@test.com" },
      currency: { code: "USD" },
    },
    {
      id: "inv_2",
      status: InvoiceStatus.PARTIALLY_PAID,
      isArchived: false,
      organizationId: "test-org-123",
      client: { id: "c_2", name: "Client B", email: "b@test.com" },
      currency: { code: "USD" },
    },
  ];

  ctx.db.organization.findFirst.mockResolvedValue({
    id: "test-org-123",
  });
  ctx.db.invoice.findMany.mockResolvedValue(mockInvoices);

  const result = await caller.unpaidInvoices({});

  expect(result).toHaveLength(2);
  expect(result[0]?.status).toBe(InvoiceStatus.SENT);
  expect(result[1]?.status).toBe(InvoiceStatus.PARTIALLY_PAID);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/routers-reports-procedures.test.ts -t "returns invoices with SENT"`
Expected: FAIL (test exists, mocked values not properly stubbed)

**Step 3: Verify mock setup is correct**

Run: `npm run test -- src/test/routers-reports-procedures.test.ts`
Expected: All tests including new one should pass

**Step 4: Add test for date range filtering**

Add to `unpaidInvoices` describe block:
```typescript
it("filters by date range when provided", async () => {
  const from = new Date("2026-01-01");
  const to = new Date("2026-01-31");

  ctx.db.organization.findFirst.mockResolvedValue({
    id: "test-org-123",
  });
  ctx.db.invoice.findMany.mockResolvedValue([]);

  await caller.unpaidInvoices({ from, to });

  expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        date: {
          gte: from,
          lte: to,
        },
      }),
    })
  );
});
```

**Step 5: Run tests**

Run: `npm run test -- src/test/routers-reports-procedures.test.ts`
Expected: Both unpaidInvoices tests pass

**Step 6: Commit**

```bash
git add src/test/routers-reports-procedures.test.ts
git commit -m "test: add unpaidInvoices success path tests"
```

---

## Task 3: Test unpaidInvoices Error Path

**Files:**
- Modify: `src/test/routers-reports-procedures.test.ts`

**Step 1: Add org not found test**

Add to `unpaidInvoices` describe block:
```typescript
it("throws NOT_FOUND when organization does not exist", async () => {
  ctx.db.organization.findFirst.mockResolvedValue(null);

  await expect(caller.unpaidInvoices({})).rejects.toThrow("NOT_FOUND");
});
```

**Step 2: Add test for archived invoices exclusion**

Add to `unpaidInvoices` describe block:
```typescript
it("excludes archived invoices", async () => {
  ctx.db.organization.findFirst.mockResolvedValue({
    id: "test-org-123",
  });
  ctx.db.invoice.findMany.mockResolvedValue([]);

  await caller.unpaidInvoices({});

  expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        isArchived: false,
      }),
    })
  );
});
```

**Step 3: Run tests**

Run: `npm run test -- src/test/routers-reports-procedures.test.ts`
Expected: All unpaidInvoices tests pass (5 total)

**Step 4: Commit**

```bash
git add src/test/routers-reports-procedures.test.ts
git commit -m "test: add unpaidInvoices error handling tests"
```

---

## Task 4: Test overdueInvoices Procedure

**Files:**
- Modify: `src/test/routers-reports-procedures.test.ts`

**Step 1: Add tests for overdueInvoices**

Add to `overdueInvoices` describe block:
```typescript
it("returns only OVERDUE invoices", async () => {
  const mockInvoices = [
    {
      id: "inv_1",
      status: InvoiceStatus.OVERDUE,
      isArchived: false,
      organizationId: "test-org-123",
      client: { id: "c_1", name: "Client A", email: "a@test.com" },
      currency: { code: "USD" },
    },
  ];

  ctx.db.organization.findFirst.mockResolvedValue({
    id: "test-org-123",
  });
  ctx.db.invoice.findMany.mockResolvedValue(mockInvoices);

  const result = await caller.overdueInvoices();

  expect(result).toHaveLength(1);
  expect(result[0]?.status).toBe(InvoiceStatus.OVERDUE);
});

it("throws NOT_FOUND when organization not found", async () => {
  ctx.db.organization.findFirst.mockResolvedValue(null);

  await expect(caller.overdueInvoices()).rejects.toThrow("NOT_FOUND");
});

it("excludes archived invoices", async () => {
  ctx.db.organization.findFirst.mockResolvedValue({
    id: "test-org-123",
  });
  ctx.db.invoice.findMany.mockResolvedValue([]);

  await caller.overdueInvoices();

  expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        isArchived: false,
      }),
    })
  );
});
```

**Step 2: Run tests**

Run: `npm run test -- src/test/routers-reports-procedures.test.ts`
Expected: All overdueInvoices tests pass (3 total)

**Step 3: Commit**

```bash
git add src/test/routers-reports-procedures.test.ts
git commit -m "test: add overdueInvoices procedure tests"
```

---

## Task 5: Test paymentsByGateway Procedure

**Files:**
- Modify: `src/test/routers-reports-procedures.test.ts`

**Step 1: Add tests for payment aggregation**

Add to `paymentsByGateway` describe block:
```typescript
it("aggregates payments by gateway", async () => {
  ctx.db.organization.findFirst.mockResolvedValue({
    id: "test-org-123",
  });
  ctx.db.payment.findMany.mockResolvedValue([
    {
      method: "stripe",
      amount: BigInt(10000),
      gatewayFee: BigInt(290),
      organizationId: "test-org-123",
    },
    {
      method: "stripe",
      amount: BigInt(20000),
      gatewayFee: BigInt(580),
      organizationId: "test-org-123",
    },
    {
      method: "paypal",
      amount: BigInt(15000),
      gatewayFee: BigInt(525),
      organizationId: "test-org-123",
    },
  ]);

  const result = await caller.paymentsByGateway({});

  expect(result.stripe).toEqual({
    count: 2,
    total: 30000,
    fees: 870,
  });
  expect(result.paypal).toEqual({
    count: 1,
    total: 15000,
    fees: 525,
  });
});

it("filters by date range", async () => {
  const from = new Date("2026-01-01");
  const to = new Date("2026-01-31");

  ctx.db.organization.findFirst.mockResolvedValue({
    id: "test-org-123",
  });
  ctx.db.payment.findMany.mockResolvedValue([]);

  await caller.paymentsByGateway({ from, to });

  expect(ctx.db.payment.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        paidAt: {
          gte: from,
          lte: to,
        },
      }),
    })
  );
});

it("throws NOT_FOUND when organization not found", async () => {
  ctx.db.organization.findFirst.mockResolvedValue(null);

  await expect(caller.paymentsByGateway({})).rejects.toThrow("NOT_FOUND");
});
```

**Step 2: Run tests**

Run: `npm run test -- src/test/routers-reports-procedures.test.ts`
Expected: All paymentsByGateway tests pass (3 total)

**Step 3: Commit**

```bash
git add src/test/routers-reports-procedures.test.ts
git commit -m "test: add paymentsByGateway procedure tests"
```

---

## Task 6: Test expenseBreakdown Procedure

**Files:**
- Modify: `src/test/routers-reports-procedures.test.ts`

**Step 1: Add tests for expense breakdown**

Add to `expenseBreakdown` describe block:
```typescript
it("groups expenses by category", async () => {
  ctx.db.organization.findFirst.mockResolvedValue({
    id: "test-org-123",
  });
  ctx.db.expense.groupBy.mockResolvedValue([
    {
      expenseCategoryId: "cat_1",
      _sum: { amount: 50000 },
      _count: { id: 5 },
    },
    {
      expenseCategoryId: "cat_2",
      _sum: { amount: 30000 },
      _count: { id: 3 },
    },
  ]);

  const result = await caller.expenseBreakdown({});

  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({
    expenseCategoryId: "cat_1",
    totalAmount: 50000,
    count: 5,
  });
});

it("filters by date range", async () => {
  const from = new Date("2026-01-01");
  const to = new Date("2026-01-31");

  ctx.db.organization.findFirst.mockResolvedValue({
    id: "test-org-123",
  });
  ctx.db.expense.groupBy.mockResolvedValue([]);

  await caller.expenseBreakdown({ from, to });

  expect(ctx.db.expense.groupBy).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        date: {
          gte: from,
          lte: to,
        },
      }),
    })
  );
});

it("throws NOT_FOUND when organization not found", async () => {
  ctx.db.organization.findFirst.mockResolvedValue(null);

  await expect(caller.expenseBreakdown({})).rejects.toThrow("NOT_FOUND");
});
```

**Step 2: Run tests**

Run: `npm run test -- src/test/routers-reports-procedures.test.ts`
Expected: All expenseBreakdown tests pass (3 total)

**Step 3: Commit**

```bash
git add src/test/routers-reports-procedures.test.ts
git commit -m "test: add expenseBreakdown procedure tests"
```

---

## Task 7: Verify Coverage Improvement

**Files:**
- Test: `src/test/routers-reports-procedures.test.ts`

**Step 1: Run complete test suite**

Run: `npm run test`
Expected: All tests pass, including 11 new reports router tests

**Step 2: Generate coverage report**

Run: `npm run test -- --coverage`
Expected: reports.ts coverage significantly improved from baseline

**Step 3: Verify all tests pass**

Expected output should show:
- Total tests: 420+ (from 409)
- Test files: 24
- All passing

**Step 4: Final commit**

```bash
git add src/test/routers-reports-procedures.test.ts
git commit -m "test: reports router procedure testing complete - 11 new tests"
```

---

## Summary

**What Gets Built:**
- 11 comprehensive integration tests for reports router
- Tests for all 4 major procedures: unpaidInvoices, overdueInvoices, paymentsByGateway, expenseBreakdown
- Success paths, error handling, and filter validation
- Uses established mock patterns from invoices router

**Expected Results:**
- Total tests: 420+ (↑11 from 409)
- reports.ts coverage: Significant improvement
- All tests passing
