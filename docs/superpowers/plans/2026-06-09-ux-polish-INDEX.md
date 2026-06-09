# UX / Polish — Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement these plans task-by-task. Each workstream is its own plan file with checkbox (`- [ ]`) steps.

**Spec:** `docs/superpowers/specs/2026-06-09-ux-polish-design.md`

**Goal:** Ship roadmap item #12 (UX/polish) — command-palette actions, dashboard customization, keyboard-first invoice editor, global activity feed, mobile flows, and accessibility — as seven coordinated workstreams.

## Testing reality (applies to every plan)

This codebase's test suite is **node-environment Vitest, 127 `.ts` test files, 0 `.tsx`**. There is **no jsdom / React Testing Library harness**. The established TDD pattern is:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { someRouter } from "@/server/routers/some";
import { createMockContext } from "./mocks/trpc-context";

const ctx = createMockContext();            // { db (mocked Prisma), orgId:"test-org-123", userId:"test-user-456", userRole:"OWNER", isActive:true }
const caller = someRouter.createCaller(ctx);
ctx.db.someModel.findMany.mockResolvedValue([...]);
const result = await caller.someProcedure({ ... });
expect(ctx.db.someModel.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "test-org-123" } }));
```

Therefore **every plan TDDs the data layer (tRPC procedures) and pure functions** (reducers, validators, keyboard helpers). React components and wiring are verified with `npx tsc --noEmit` (must stay clean) and manual checks via the `verify` / `run` skills — **not** component-render tests. Do not add a jsdom harness; it is out of scope.

## Build order (dependency-driven)

| # | Plan file | Delivers (spec WS) | Depends on |
|---|-----------|--------------------|-----------|
| 1 | `2026-06-09-ux-polish-WS1-action-primitives.md` | WS1 shared action primitives + `invoices.openForReminder` query | — |
| 2 | `2026-06-09-ux-polish-WS2-invoice-editor.md` | WS2 editor refactor, keyboard entry, copy-previous, a11y F2/F4/F7 | WS1 (`invoices.lastForClient`) |
| 3 | `2026-06-09-ux-polish-WS3-palette-actions.md` | WS3 command-palette actions (#1) | WS1 |
| 4 | `2026-06-09-ux-polish-WS4-mobile-flows.md` | WS4 mobile quick-flows (#5) | WS1 |
| 5 | `2026-06-09-ux-polish-WS5-dashboard-customization.md` | WS5 per-user dashboard layout (#2) | — |
| 6 | `2026-06-09-ux-polish-WS6-global-feed.md` | WS6 `/activity` feed + project/ticket audit logging (#4) | — |
| 7 | `2026-06-09-ux-polish-WS7-accessibility.md` | WS7 labels, skip-link, `useBulkSelection` (#6) | — |

Each plan lands `npx tsc --noEmit` clean and its new tests green before the next begins. Run the full suite (`npm test`) at each workstream boundary to catch regressions.

## Conventions used by all plans

- **Org scoping:** every new query/mutation filters by `ctx.orgId` (and `ctx.userId` for per-user data). Match the inline `where: { organizationId: ctx.orgId }` pattern.
- **New routers** are registered in `src/server/routers/_app.ts`.
- **tRPC client** in components: `import { trpc } from "@/trpc/client"` → `trpc.x.y.useQuery/useMutation`.
- **Toasts:** `import { toast } from "sonner"`.
- **Dialogs/sheets:** `@/components/ui/dialog`, shadcn primitives already in repo.
- **Icons:** `lucide-react`.
- **Commit cadence:** commit after each task's tests pass.
