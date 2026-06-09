# WS6 — Global Activity Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user-facing `/activity` page: a filterable unified timeline (entity type, action, date range, pagination) over `AuditLog`, covering invoices, clients, **projects, tickets**, and payments — adding audit logging to projects + tickets (which don't currently write audit rows) so the feed delivers on that promise.

**Architecture:** Extend `auditLog.list` with `entityTypes` / `action` / `from` / `to` filters (TDD). Add `logAudit` calls to `projects.ts` and `tickets.ts` mutations (TDD by asserting the mocked `logAudit`). Build `/activity` reusing `ActivityFeed` presentation. No backfill — new rows only.

**Tech Stack:** tRPC v11, Zod 4, Vitest (node), the existing `ActivityFeed` component + `auditLog` router + `logAudit` service.

**Prereq:** none (independent). The audit test pattern: `vi.mock("@/server/services/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }))`, then assert on the imported mock.

---

### Task 1: Extend `auditLog.list` with filters

**Files:**
- Modify: `src/server/routers/auditLog.ts`
- Test: `src/test/routers-auditlog-filters.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { auditLogRouter } from "@/server/routers/auditLog";
import { createMockContext } from "./mocks/trpc-context";

describe("auditLog.list filters", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof auditLogRouter.createCaller>;
  beforeEach(() => {
    ctx = createMockContext();
    caller = auditLogRouter.createCaller(ctx);
    ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
    ctx.db.auditLog.findMany.mockResolvedValue([]);
  });

  it("filters by multiple entity types, action, and date range", async () => {
    await caller.list({
      entityTypes: ["Invoice", "Project"],
      action: "CREATED",
      from: new Date("2026-06-01"),
      to: new Date("2026-06-30"),
    });
    const arg = ctx.db.auditLog.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      organizationId: "test-org-123",
      entityType: { in: ["Invoice", "Project"] },
      action: "CREATED",
    });
    expect(arg.where.createdAt).toMatchObject({ gte: new Date("2026-06-01"), lte: new Date("2026-06-30") });
  });

  it("omits filters that are not provided", async () => {
    await caller.list({});
    const arg = ctx.db.auditLog.findMany.mock.calls[0][0];
    expect(arg.where.entityType).toBeUndefined();
    expect(arg.where.action).toBeUndefined();
    expect(arg.where.createdAt).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/routers-auditlog-filters.test.ts`
Expected: FAIL — `list` rejects unknown input keys / ignores them.

- [ ] **Step 3: Extend the procedure**

Replace the `list` input + `where` in `src/server/routers/auditLog.ts`:

```ts
  list: protectedProcedure
    .input(
      z.object({
        entityType: z.string().optional(),        // kept for back-compat (single)
        entityTypes: z.array(z.string()).optional(),
        entityId: z.string().optional(),
        action: z.string().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { id: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const entityTypeFilter =
        input.entityTypes && input.entityTypes.length > 0
          ? { entityType: { in: input.entityTypes } }
          : input.entityType
            ? { entityType: input.entityType }
            : {};

      const createdAt =
        input.from || input.to
          ? { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) }
          : undefined;

      return ctx.db.auditLog.findMany({
        where: {
          organizationId: org.id,
          ...entityTypeFilter,
          ...(input.entityId ? { entityId: input.entityId } : {}),
          ...(input.action ? { action: input.action } : {}),
          ...(createdAt ? { createdAt } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        skip: input.offset,
      });
    }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/routers-auditlog-filters.test.ts`
Expected: PASS (2 tests). Run the existing `routers-auditlog-procedures.test.ts` too — must stay green (back-compat preserved).

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/server/routers/auditLog.ts src/test/routers-auditlog-filters.test.ts
git commit -m "feat(auditLog): entityTypes/action/date filters on list"
```

---

### Task 2: Audit logging for projects

**Files:**
- Modify: `src/server/routers/projects.ts` (add `logAudit` to create/update/archive/delete)
- Test: `src/test/routers-projects-audit.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { logAudit } from "@/server/services/audit";
import { projectsRouter } from "@/server/routers/projects";
import { createMockContext } from "./mocks/trpc-context";

vi.mock("@/server/services/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

describe("projects audit logging", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof projectsRouter.createCaller>;
  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    caller = projectsRouter.createCaller(ctx);
  });

  it("logs CREATED with entityType Project on create", async () => {
    // $transaction mock should invoke the callback with a tx that proxies ctx.db
    ctx.db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(ctx.db));
    ctx.db.project.create.mockResolvedValue({ id: "proj_1", name: "Website" });

    await caller.create({ name: "Website" } as never);

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATED", entityType: "Project", entityId: "proj_1", entityLabel: "Website", organizationId: "test-org-123" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/routers-projects-audit.test.ts`
Expected: FAIL — `logAudit` not called.

> Note: verify the mock context's `$transaction` behavior. If `createMockPrismaClient` already implements `$transaction` to run the callback, drop the `mockImplementation` line; if not, keep it. Match the create input to the real `projectWriteSchema` (the `as never` is a stand-in — replace with the minimal valid input the schema requires).

- [ ] **Step 3: Add `logAudit` calls**

Import at top of `projects.ts`: `import { logAudit } from "../services/audit";`. After the project is created (inside or right after the transaction returns `project`), and in `update`/`archive`/`delete`, add:

```ts
// create — after the transaction resolves `project`:
await logAudit({ action: "CREATED", entityType: "Project", entityId: project.id, entityLabel: project.name, userId: ctx.userId, organizationId: ctx.orgId }).catch(() => {});
// update:
await logAudit({ action: "UPDATED", entityType: "Project", entityId: updated.id, entityLabel: updated.name, userId: ctx.userId, organizationId: ctx.orgId }).catch(() => {});
// archive:
await logAudit({ action: "STATUS_CHANGED", entityType: "Project", entityId: archived.id, entityLabel: archived.name, userId: ctx.userId, organizationId: ctx.orgId }).catch(() => {});
// delete:
await logAudit({ action: "DELETED", entityType: "Project", entityId: input.id, entityLabel: existing?.name ?? null, userId: ctx.userId, organizationId: ctx.orgId }).catch(() => {});
```

> Note: use the actual result variable names in each procedure (`update` may return the updated row as a different identifier; `delete` may not return the row — fetch its name before deleting, or pass the id only). Restructure `create` if needed so `logAudit` runs after the `$transaction` returns (the audit call must not be inside the transaction). Confirm `AuditAction` enum has `CREATED/UPDATED/STATUS_CHANGED/DELETED` (it does — used elsewhere).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/routers-projects-audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/server/routers/projects.ts src/test/routers-projects-audit.test.ts
git commit -m "feat(audit): log Project create/update/archive/delete"
```

---

### Task 3: Audit logging for tickets

**Files:**
- Modify: `src/server/routers/tickets.ts` (add `logAudit` to create + updateStatus)
- Test: `src/test/routers-tickets-audit.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { logAudit } from "@/server/services/audit";
import { ticketsRouter } from "@/server/routers/tickets";
import { createMockContext } from "./mocks/trpc-context";

vi.mock("@/server/services/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

describe("tickets audit logging", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof ticketsRouter.createCaller>;
  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    caller = ticketsRouter.createCaller(ctx);
  });

  it("logs CREATED with entityType Ticket on create", async () => {
    ctx.db.ticket.create.mockResolvedValue({ id: "tkt_1", number: 7, subject: "Bug" });
    await caller.create({ subject: "Bug" } as never);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATED", entityType: "Ticket", entityId: "tkt_1", organizationId: "test-org-123" }),
    );
  });

  it("logs STATUS_CHANGED on updateStatus", async () => {
    ctx.db.ticket.update.mockResolvedValue({ id: "tkt_1", number: 7, subject: "Bug", status: "CLOSED" });
    await caller.updateStatus({ id: "tkt_1", status: "CLOSED" } as never);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "STATUS_CHANGED", entityType: "Ticket", entityId: "tkt_1" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/routers-tickets-audit.test.ts`
Expected: FAIL — `logAudit` not called.

> Note: match the real `create`/`updateStatus` input schemas (replace `as never`). Verify the model name is `ctx.db.ticket` and the create returns `{ id, number, subject }`. Adjust `entityLabel` to a useful string (e.g. `#${created.number} ${created.subject}`).

- [ ] **Step 3: Add `logAudit` calls**

Import `logAudit` and add after create / updateStatus mutations:

```ts
await logAudit({ action: "CREATED", entityType: "Ticket", entityId: created.id, entityLabel: `#${created.number} ${created.subject}`, userId: ctx.userId, organizationId: ctx.orgId }).catch(() => {});
await logAudit({ action: "STATUS_CHANGED", entityType: "Ticket", entityId: updated.id, entityLabel: `#${updated.number} ${updated.subject}`, userId: ctx.userId, organizationId: ctx.orgId }).catch(() => {});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/routers-tickets-audit.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/server/routers/tickets.ts src/test/routers-tickets-audit.test.ts
git commit -m "feat(audit): log Ticket create/status-change"
```

---

### Task 4: `/activity` page + filters

**Files:**
- Create: `src/app/(dashboard)/activity/page.tsx`
- Create: `src/components/activity/ActivityFilters.tsx`
- Reference: `src/components/dashboard/ActivityFeed.tsx` (presentational — `entityType`, `entityLabel`, `action`, `createdAt`)
- Modify: navigation (sidebar + `MobileNav.tsx` `moreItems`) to add an "Activity" link

- [ ] **Step 1: Build the client page**

`activity/page.tsx` (client) — uses `trpc.auditLog.list.useQuery({ entityTypes, action, from, to, limit, offset })`, renders results through the existing `ActivityFeed` (extend `ActivityFeed` to optionally deep-link each row to `/<entityType lowercased>s/<entityId>`), and provides a "Load more" button incrementing `offset`.

> Note: `ActivityFeed`'s item type currently has no `entityId`; add `entityId` to its `ActivityItem` type and an optional link wrapper. `auditLog.list` already returns the full rows including `entityId`. Keep the change backward-compatible for the dashboard's existing usage (link optional).

- [ ] **Step 2: Build the filter bar**

`ActivityFilters.tsx` — entity-type multi-select (Invoice, Client, Project, Ticket, Payment/PartialPayment, Expense, CreditNote, Contractor, Dispute), an action dropdown (CREATED, UPDATED, SENT, PAYMENT_RECEIVED, STATUS_CHANGED, VIEWED, DELETED), and a date-range pair. Emits a filter object the page passes to the query.

- [ ] **Step 3: Add nav links**

Add `{ href: "/activity", label: "Activity", icon: <an appropriate lucide icon> }` to the sidebar nav config and `MobileNav.tsx` `moreItems`.

> Note: find the desktop sidebar nav config (likely in `src/components/layout/` — grep for the `moreItems`-equivalent desktop list) and add the entry there too.

- [ ] **Step 4: Typecheck + verify + commit**

Run: `npx tsc --noEmit && npm test`
Manual (use `verify` skill): `/activity` lists recent audit rows; filtering by entity type / action / date narrows results; "Load more" pages; creating a project or changing a ticket status produces a new feed row (proves Tasks 2–3).

```bash
git add "src/app/(dashboard)/activity/page.tsx" src/components/activity/ActivityFilters.tsx src/components/dashboard/ActivityFeed.tsx src/components/layout/MobileNav.tsx
git commit -m "feat(activity): global activity feed page (#4)"
```

---

### Task 5: Workstream verification

- [ ] **Step 1:** `npx tsc --noEmit && npm test` — clean, all pass (incl. new filter + audit tests; existing audit-log test still green).
- [ ] **Step 2:** Manual (use `verify` skill): exercise a project create + ticket status change, then confirm both appear in `/activity` with working deep links and filters.

---

## Self-review notes
- **Spec coverage (WS6):** filterable timeline ✅, all five promised entity types (projects + tickets now logged) ✅, pagination ✅, distinct from admin `/settings/audit-log` (shares data, different page) ✅.
- **Verify-during-wiring:** mock `$transaction` behavior; real create/updateStatus input schemas; ticket model/field names; desktop sidebar nav location; `ActivityFeed` item type extension stays back-compat.
- **Type consistency:** entity-type strings used in `ActivityFilters` match the `entityType` literals written by `logAudit` calls ("Project", "Ticket", "Invoice", …). `auditLog.list` filter keys (`entityTypes`, `action`, `from`, `to`) match the page's query args.
