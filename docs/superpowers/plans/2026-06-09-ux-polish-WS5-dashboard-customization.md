# WS5 — Dashboard Widget Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each user choose which dashboard cards are visible and in what order (cash flow, overdue invoices, revenue, tasks, retainer burn, expenses), persisted per (user, org).

**Architecture:** New `UserDashboardPreference` Prisma model stores an ordered `{ key, visible }[]` as JSON. A pure `layout` module (default order + validation/normalization against the widget registry) is TDD'd. Two tRPC procedures (`dashboardLayout.get` / `dashboardLayout.save`) are TDD'd. A client "edit layout" island toggles visibility + reorders (DnD-Kit, keyboard-accessible). Show/hide + reorder only — **no resize, no custom grids** (YAGNI per spec).

**Tech Stack:** Prisma 7, tRPC v11, Zod 4, `@dnd-kit/*`, React.

**Prereq:** none (independent workstream).

---

### Task 1: Prisma model + migration

**Files:**
- Modify: `prisma/schema.prisma` (add model + back-relation on `Organization`)

- [ ] **Step 1: Add the model**

Append to `prisma/schema.prisma`:

```prisma
model UserDashboardPreference {
  id             String       @id @default(cuid())
  userId         String
  organizationId String
  layoutJson     String       // JSON: ordered array of { key: string, visible: boolean }
  updatedAt      DateTime     @updatedAt
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([userId, organizationId])
  @@index([organizationId])
}
```

Add the back-relation field inside `model Organization { … }`:

```prisma
  dashboardPreferences UserDashboardPreference[]
```

> Note: match the existing relation style in `model Organization` (other relations there show the exact convention). `User` is a Supabase auth user referenced by id string elsewhere in this schema (no FK to a local `User` table for auth users in most rows) — follow how other per-user rows (e.g. `Timer.userId`, `TimeEntry.userId`) are modeled; they use a bare `userId String` without a relation, so do the same here (only the `organizationId` relation is added).

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --name add_user_dashboard_preference`
Expected: migration created + applied to the dev DB; `prisma generate` runs.

> Note: if no local DB is available, run `npx prisma migrate dev --create-only --name add_user_dashboard_preference` to generate SQL without applying, and apply later. Do NOT hand-edit `schema.prisma` without a corresponding migration — `npm run build` runs `prisma migrate deploy`.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(dashboard): UserDashboardPreference model + migration"
```

---

### Task 2: Widget registry + pure layout module

**Files:**
- Create: `src/components/dashboard/widget-registry.ts`
- Create: `src/lib/dashboard-layout.ts` (pure: default order, normalize/validate)
- Test: `src/test/dashboard-layout.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { WIDGET_KEYS, DEFAULT_LAYOUT, normalizeLayout } from "@/lib/dashboard-layout";

describe("dashboard-layout", () => {
  it("DEFAULT_LAYOUT lists every registry key, all visible", () => {
    expect(DEFAULT_LAYOUT.map((w) => w.key).sort()).toEqual([...WIDGET_KEYS].sort());
    expect(DEFAULT_LAYOUT.every((w) => w.visible)).toBe(true);
  });

  it("normalizeLayout drops unknown keys and appends missing keys (hidden=false default visible)", () => {
    const saved = [{ key: "revenue", visible: false }, { key: "bogus", visible: true }];
    const result = normalizeLayout(saved);
    expect(result.find((w) => w.key === "bogus")).toBeUndefined();          // unknown dropped
    expect(result.find((w) => w.key === "revenue")).toEqual({ key: "revenue", visible: false }); // honored
    expect(result.map((w) => w.key).sort()).toEqual([...WIDGET_KEYS].sort()); // all present
  });

  it("normalizeLayout preserves saved order, missing keys appended in default order", () => {
    const result = normalizeLayout([{ key: "expenses", visible: true }]);
    expect(result[0].key).toBe("expenses");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/dashboard-layout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure module**

`src/lib/dashboard-layout.ts`:

```ts
export const WIDGET_KEYS = [
  "cashFlow",
  "overdue",
  "revenue",
  "tasks",
  "retainerBurn",
  "expenses",
] as const;

export type WidgetKey = (typeof WIDGET_KEYS)[number];
export type LayoutEntry = { key: WidgetKey; visible: boolean };

export const DEFAULT_LAYOUT: LayoutEntry[] = WIDGET_KEYS.map((key) => ({ key, visible: true }));

const KEY_SET = new Set<string>(WIDGET_KEYS);

/** Drop unknown keys, keep saved order, append any missing known keys (visible) in default order. */
export function normalizeLayout(saved: Array<{ key: string; visible: boolean }>): LayoutEntry[] {
  const seen = new Set<string>();
  const kept: LayoutEntry[] = [];
  for (const entry of saved) {
    if (KEY_SET.has(entry.key) && !seen.has(entry.key)) {
      seen.add(entry.key);
      kept.push({ key: entry.key as WidgetKey, visible: !!entry.visible });
    }
  }
  for (const key of WIDGET_KEYS) {
    if (!seen.has(key)) kept.push({ key, visible: true });
  }
  return kept;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/dashboard-layout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the registry (maps key → label + component)**

`src/components/dashboard/widget-registry.ts` — map each `WidgetKey` to a display label and the dashboard section component that renders it. Reuse existing components where present (`SummaryCards`/`CashFlowInsights`/`AgingReceivables`/etc. from `src/app/(dashboard)/page.tsx`); add thin wrappers for `tasks` and `retainerBurn` if no card exists yet.

```ts
import type { WidgetKey } from "@/lib/dashboard-layout";

export const WIDGET_META: Record<WidgetKey, { label: string }> = {
  cashFlow: { label: "Cash flow" },
  overdue: { label: "Overdue invoices" },
  revenue: { label: "Revenue" },
  tasks: { label: "Tasks" },
  retainerBurn: { label: "Retainer burn" },
  expenses: { label: "Expenses" },
};
```

> Note: the registry's job is the label/visibility contract used by the edit island; the actual section→component mapping stays in the dashboard page (Task 4). Keep `WIDGET_META` keys exactly equal to `WIDGET_KEYS` (a compile error here means they drifted).

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/dashboard-layout.ts src/components/dashboard/widget-registry.ts src/test/dashboard-layout.test.ts
git commit -m "feat(dashboard): widget registry + pure layout normalization"
```

---

### Task 3: `dashboardLayout` router (get/save)

**Files:**
- Create: `src/server/routers/dashboardLayout.ts`
- Modify: `src/server/routers/_app.ts` (register)
- Test: `src/test/routers-dashboard-layout.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { dashboardLayoutRouter } from "@/server/routers/dashboardLayout";
import { createMockContext } from "./mocks/trpc-context";

describe("dashboardLayout router", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof dashboardLayoutRouter.createCaller>;
  beforeEach(() => {
    ctx = createMockContext();
    caller = dashboardLayoutRouter.createCaller(ctx);
  });

  it("get returns the default layout when none saved", async () => {
    ctx.db.userDashboardPreference.findUnique.mockResolvedValue(null);
    const result = await caller.get();
    expect(result.map((w: { key: string }) => w.key)).toContain("cashFlow");
    expect(result.every((w: { visible: boolean }) => w.visible)).toBe(true);
  });

  it("get normalizes a stored layout (drops unknown keys)", async () => {
    ctx.db.userDashboardPreference.findUnique.mockResolvedValue({
      layoutJson: JSON.stringify([{ key: "revenue", visible: false }, { key: "junk", visible: true }]),
    });
    const result = await caller.get();
    expect(result.find((w: { key: string }) => w.key === "junk")).toBeUndefined();
    expect(result.find((w: { key: string }) => w.key === "revenue")).toMatchObject({ visible: false });
  });

  it("save upserts scoped to (user, org) and rejects unknown keys", async () => {
    ctx.db.userDashboardPreference.upsert.mockResolvedValue({});
    await caller.save({ layout: [{ key: "expenses", visible: true }] });
    expect(ctx.db.userDashboardPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_organizationId: { userId: "test-user-456", organizationId: "test-org-123" } },
      }),
    );
    await expect(
      // @ts-expect-error invalid key must be rejected by the Zod enum
      caller.save({ layout: [{ key: "junk", visible: true }] }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/routers-dashboard-layout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the router**

`src/server/routers/dashboardLayout.ts`:

```ts
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { WIDGET_KEYS, normalizeLayout } from "@/lib/dashboard-layout";

const layoutEntrySchema = z.object({
  key: z.enum(WIDGET_KEYS),
  visible: z.boolean(),
});

export const dashboardLayoutRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const pref = await ctx.db.userDashboardPreference.findUnique({
      where: { userId_organizationId: { userId: ctx.userId!, organizationId: ctx.orgId! } },
      select: { layoutJson: true },
    });
    let saved: Array<{ key: string; visible: boolean }> = [];
    if (pref?.layoutJson) {
      try { saved = JSON.parse(pref.layoutJson); } catch { saved = []; }
    }
    return normalizeLayout(saved);
  }),

  save: protectedProcedure
    .input(z.object({ layout: z.array(layoutEntrySchema).max(WIDGET_KEYS.length) }))
    .mutation(async ({ ctx, input }) => {
      const layoutJson = JSON.stringify(normalizeLayout(input.layout));
      await ctx.db.userDashboardPreference.upsert({
        where: { userId_organizationId: { userId: ctx.userId!, organizationId: ctx.orgId! } },
        create: { userId: ctx.userId!, organizationId: ctx.orgId!, layoutJson },
        update: { layoutJson },
      });
      return { ok: true };
    }),
});
```

Register in `src/server/routers/_app.ts`: import `dashboardLayoutRouter` and add `dashboardLayout: dashboardLayoutRouter,` to the `appRouter` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/routers-dashboard-layout.test.ts`
Expected: PASS (3 tests).

> Note: `z.enum(WIDGET_KEYS)` needs `WIDGET_KEYS` as a readonly tuple — it is (`as const`). If Zod 4 rejects the readonly array, use `z.enum([...WIDGET_KEYS] as [string, ...string[]])`.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/server/routers/dashboardLayout.ts src/server/routers/_app.ts src/test/routers-dashboard-layout.test.ts
git commit -m "feat(dashboard): dashboardLayout get/save procedures"
```

---

### Task 4: Apply saved layout on the dashboard + edit island

**Files:**
- Create: `src/components/dashboard/DashboardLayoutEditor.tsx` (client island)
- Modify: `src/app/(dashboard)/page.tsx` (honor saved order/visibility; mount the editor toggle)

- [ ] **Step 1: Build the edit island**

`DashboardLayoutEditor.tsx` — a client component that loads `trpc.dashboardLayout.get`, renders each widget as a reorderable row (DnD-Kit sortable, with `KeyboardSensor` + `sortableKeyboardCoordinates` like `LineItemEditor`) with a visibility checkbox, and saves via `trpc.dashboardLayout.save` on change (debounced) with a `sonner` toast. Uses `WIDGET_META[key].label` for labels.

> Note: keyboard accessibility is required (WS7 standards) — include `KeyboardSensor` and an `aria-live` announcer, same pattern as the WS2 LineItemEditor.

- [ ] **Step 2: Honor the layout in the dashboard page**

In `src/app/(dashboard)/page.tsx`, fetch the layout server-side (`await api.dashboardLayout.get()`), build a `key → <Suspense section>` map for the six widget keys, then render the sections in the saved order, skipping `visible: false`. Keep the existing Suspense/streaming structure per section.

> Note: the current page mixes several KPI cards into single sections (e.g. `SummarySection` renders four cards). Map the six customizable widget keys onto the appropriate existing sections; where a key (e.g. `tasks`, `retainerBurn`) has no dedicated section yet, add a thin one over an existing query (`dashboard.dueThisWeek` for tasks; a retainer-burn query if present, else defer that card behind a `> Note:` and ship the other five). Do not silently drop a key — if `retainerBurn` has no data source, log it in the PR description.

- [ ] **Step 3: Add the "Edit layout" toggle**

Add a button on the dashboard that opens `DashboardLayoutEditor` (Dialog or inline panel). On save, revalidate/refresh so the new order takes effect.

- [ ] **Step 4: Typecheck + verify + commit**

Run: `npx tsc --noEmit && npm test`
Manual (use `verify` skill): hide a card → it disappears; reorder via drag and via keyboard → order persists across reload; the layout is per-user (different user sees default).

```bash
git add src/components/dashboard/DashboardLayoutEditor.tsx "src/app/(dashboard)/page.tsx"
git commit -m "feat(dashboard): per-user widget customization (show/hide + reorder)"
```

---

### Task 5: Workstream verification

- [ ] **Step 1:** `npx tsc --noEmit && npm test` — clean, all pass (incl. layout + router tests).
- [ ] **Step 2:** Manual (use `verify` skill): full round-trip — reorder, hide, reload, confirm persistence and per-user isolation.

---

## Self-review notes
- **Spec coverage (WS5):** model + migration ✅, registry ✅, get/save ✅, edit island (show/hide + reorder) ✅, all six card keys ✅.
- **Verify-during-wiring:** Organization relation style; local DB availability for `migrate dev`; Zod readonly-tuple enum; mapping widget keys → existing sections (esp. `tasks`/`retainerBurn` data sources).
- **Type consistency:** `WIDGET_KEYS`/`WidgetKey`/`LayoutEntry` defined once in `dashboard-layout.ts`; the router enum, registry `WIDGET_META`, and island all import them. `normalizeLayout` is the single source of layout truth (used by both `get` and `save`).
