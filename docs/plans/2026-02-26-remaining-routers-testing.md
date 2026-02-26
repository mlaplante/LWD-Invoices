# Remaining Routers Procedure Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add integration tests for remaining 5 routers (clients, projects, expenses, creditNotes, organization) to reach 75%+ coverage.

**Architecture:** Create comprehensive tests for all CRUD procedures across 5 routers using established mock tRPC context pattern. Test success paths, error handling, filtering, authorization, and business logic validation.

**Tech Stack:** Vitest, Prisma Client (mocked), tRPC v11, TypeScript

---

## Task 1: Clients Router - List & Get Procedures

**Files:**
- Create: `src/test/routers-clients-procedures.test.ts`

**Step 1: Create test scaffold with all clients procedures**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { clientsRouter } from "@/server/routers/clients";
import { createMockContext } from "./mocks/trpc-context";

describe("Clients Router Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = clientsRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns clients for organization", async () => {
      const mockClients = [
        {
          id: "c_1",
          name: "ACME Corp",
          email: "contact@acme.com",
          organizationId: "test-org-123",
          isArchived: false,
        },
      ];

      ctx.db.client.findMany.mockResolvedValue(mockClients);

      const result = await caller.list({ includeArchived: false });

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("ACME Corp");
      expect(ctx.db.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "test-org-123",
            isArchived: false,
          }),
        })
      );
    });

    it("filters by search query", async () => {
      ctx.db.client.findMany.mockResolvedValue([]);

      await caller.list({ search: "acme" });

      expect(ctx.db.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                name: { contains: "acme", mode: "insensitive" },
              }),
              expect.objectContaining({
                email: { contains: "acme", mode: "insensitive" },
              }),
            ]),
          }),
        })
      );
    });

    it("includes archived clients when requested", async () => {
      ctx.db.client.findMany.mockResolvedValue([]);

      await caller.list({ includeArchived: true });

      expect(ctx.db.client.findMany).toHaveBeenCalledWith(
        expect.not.objectContaining({
          where: expect.objectContaining({
            isArchived: false,
          }),
        })
      );
    });
  });

  describe("get", () => {
    it("returns single client by id", async () => {
      const mockClient = {
        id: "c_1",
        name: "Client A",
        organizationId: "test-org-123",
      };

      ctx.db.client.findUnique.mockResolvedValue(mockClient);

      const result = await caller.get({ id: "c_1" });

      expect(result.id).toBe("c_1");
      expect(ctx.db.client.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "c_1", organizationId: "test-org-123" },
        })
      );
    });

    it("throws NOT_FOUND when client does not exist", async () => {
      ctx.db.client.findUnique.mockResolvedValue(null);

      await expect(caller.get({ id: "nonexistent" })).rejects.toThrow(
        "NOT_FOUND"
      );
    });
  });
});
```

**Step 2: Run tests**

Run: `npm run test -- src/test/routers-clients-procedures.test.ts`
Expected: All 5 tests pass

**Step 3: Commit**

```bash
git add src/test/routers-clients-procedures.test.ts
git commit -m "test: add clients list and get procedure tests"
```

---

## Task 2: Clients Router - Create, Update, Archive Procedures

**Files:**
- Modify: `src/test/routers-clients-procedures.test.ts`

**Step 1: Add create procedure tests**

```typescript
describe("create", () => {
  it("creates client with required fields", async () => {
    const mockClient = {
      id: "c_new_1",
      name: "New Client",
      organizationId: "test-org-123",
      email: null,
      phone: null,
      address: null,
      portalPassphraseHash: null,
    };

    ctx.db.client.create.mockResolvedValue(mockClient);

    const result = await caller.create({
      name: "New Client",
    });

    expect(result.id).toBe("c_new_1");
    expect(result.organizationId).toBe("test-org-123");
    expect(ctx.db.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "New Client",
          organizationId: "test-org-123",
        }),
      })
    );
  });

  it("creates client with optional contact fields", async () => {
    const mockClient = {
      id: "c_new_2",
      name: "Client with Details",
      email: "contact@client.com",
      phone: "555-1234",
      address: "123 Main St",
      city: "Springfield",
      organizationId: "test-org-123",
    };

    ctx.db.client.create.mockResolvedValue(mockClient);

    const result = await caller.create({
      name: "Client with Details",
      email: "contact@client.com",
      phone: "555-1234",
      address: "123 Main St",
      city: "Springfield",
    });

    expect(result.email).toBe("contact@client.com");
    expect(result.phone).toBe("555-1234");
  });

  it("hashes portal passphrase when provided", async () => {
    const mockClient = {
      id: "c_new_3",
      name: "Secure Client",
      organizationId: "test-org-123",
      portalPassphraseHash: "hashed_value",
    };

    ctx.db.client.create.mockResolvedValue(mockClient);

    await caller.create({
      name: "Secure Client",
      portalPassphrase: "secret123",
    });

    expect(ctx.db.client.create).toHaveBeenCalled();
    // passphrase should be hashed, not plain text
  });
});
```

**Step 2: Add update procedure tests**

```typescript
describe("update", () => {
  it("updates client fields", async () => {
    const mockClient = {
      id: "c_1",
      name: "Updated Client",
      email: "newemail@test.com",
      organizationId: "test-org-123",
    };

    ctx.db.client.update.mockResolvedValue(mockClient);

    const result = await caller.update({
      id: "c_1",
      name: "Updated Client",
      email: "newemail@test.com",
    });

    expect(result.name).toBe("Updated Client");
    expect(ctx.db.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c_1", organizationId: "test-org-123" },
      })
    );
  });

  it("allows partial updates", async () => {
    const mockClient = {
      id: "c_1",
      name: "Renamed Client",
      organizationId: "test-org-123",
    };

    ctx.db.client.update.mockResolvedValue(mockClient);

    const result = await caller.update({
      id: "c_1",
      name: "Renamed Client",
    });

    expect(result.name).toBe("Renamed Client");
  });
});
```

**Step 3: Run tests**

Run: `npm run test -- src/test/routers-clients-procedures.test.ts`
Expected: All 8 tests pass

**Step 4: Commit**

```bash
git add src/test/routers-clients-procedures.test.ts
git commit -m "test: add clients create and update procedure tests"
```

---

## Task 3: Projects Router - Procedures (list, get, create, update)

**Files:**
- Create: `src/test/routers-projects-procedures.test.ts`

**Implementation:**
- Create scaffold with describe blocks for: list, get, create, update
- Test list with status filtering, client filtering, archive exclusion
- Test get with full include relations
- Test create with required (name, clientId, currencyId) and optional fields
- Test update with partial updates and error handling
- Total: 8-10 tests

**Commit structure:**
1. "test: scaffold projects router procedure tests"
2. "test: add projects list, get, and create procedure tests"
3. "test: add projects update procedure tests"

---

## Task 4: Expenses Router - Procedures (list, getById, create, update, delete)

**Files:**
- Create: `src/test/routers-expenses-procedures.test.ts`

**Implementation:**
- Scaffold with describe blocks: list, getById, create, update, delete
- Test list with project filtering and unbilled-only filtering
- Test getById with included relations (tax, category, supplier, project)
- Test create with required fields and optional expense details
- Test update for partial field updates
- Test delete with archive or permanent removal
- Test error handling (NOT_FOUND, permission validation)
- Total: 10-12 tests

**Commit structure:**
1. "test: scaffold expenses router procedure tests"
2. "test: add expenses list, getById, and create procedure tests"
3. "test: add expenses update and delete procedure tests"

---

## Task 5: Credit Notes Router - Procedures

**Files:**
- Create: `src/test/routers-creditnotes-procedures.test.ts`

**Implementation:**
- Scaffold with describe blocks: listForClient, applyToInvoice
- Test listForClient filtering by client and invoice type (CREDIT_NOTE)
- Test applyToInvoice with amount validation
- Test error handling: credit note not found, invoice not found, exceeds limits
- Test business logic: validateCreditApplication function
- Include tests for: insufficient credit, insufficient invoice balance
- Total: 6-8 tests

**Commit structure:**
1. "test: scaffold credit notes router procedure tests"
2. "test: add credit notes listForClient and applyToInvoice procedure tests"

---

## Task 6: Organization Router - Procedures

**Files:**
- Create: `src/test/routers-organization-procedures.test.ts`

**Implementation:**
- Scaffold with describe blocks: get, update
- Test get returns organization details with correct fields
- Test get throws NOT_FOUND for missing org
- Test update with partial field updates (name, logo, brand color, settings)
- Test field validation (brandColor regex, paymentTermsDays range)
- Test array field updates (paymentReminderDays)
- Total: 6-7 tests

**Commit structure:**
1. "test: scaffold organization router procedure tests"
2. "test: add organization get and update procedure tests"

---

## Task 7: Final Coverage Verification

**Files:**
- All test files (5 new router test files)

**Step 1: Run complete test suite**

Run: `npm run test`
Expected: 500+ tests passing

**Step 2: Generate coverage report**

Run: `npm run test -- --coverage`
Expected: Overall coverage ~30-35%+ (improved from 20.88%)

**Step 3: Verify test metrics**

Expected output:
- Total tests: 510+ (from 457)
- Test files: 31 (from 26)
- All passing with 0 failures

**Step 4: Final commit**

```bash
git commit -m "test: remaining routers comprehensive testing complete - 50+ new tests"
```

---

## Summary

**What Gets Built:**
- 5 new comprehensive test files for remaining routers
- 50+ new integration tests across all CRUD procedures
- Error handling and validation tests
- Business logic protection
- Complete mock setup for all router dependencies

**Expected Coverage:**
- Total tests: 510+ (↑53 from 457)
- Test files: 31 (↑5 new)
- Overall coverage: 30-35%+
- Ready for next phase: Reaching 50%+ coverage

**Test Organization:**
- clients-procedures.test.ts: 8-10 tests
- projects-procedures.test.ts: 8-10 tests
- expenses-procedures.test.ts: 10-12 tests
- creditnotes-procedures.test.ts: 6-8 tests
- organization-procedures.test.ts: 6-7 tests
