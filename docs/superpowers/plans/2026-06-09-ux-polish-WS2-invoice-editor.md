# WS2 — Keyboard-First Invoice Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the invoice line-item editor keyboard-first (Enter→new row, duplicate, shortcuts), add "copy previous invoice", and absorb accessibility items F2 (hydration), F4 (component extraction), and F7 (drag-reorder announcer) — in one coordinated pass over `InvoiceForm.tsx` (724L) and `LineItemEditor.tsx` (616L).

**Architecture:** TDD the one new data-layer unit (`invoices.lastForClient`) and the pure keyboard helpers; refactor the two large components incrementally (each extraction kept behavior-preserving and typecheck-verified). DnD-Kit `KeyboardSensor` is **already wired** in `LineItemEditor.tsx`, and `SortableLineItem` is **already memoized** — so F7 reduces to adding an `aria-live` announcer, and F4 reduces to extracting the `InvoiceForm` sections (the row is already extracted/memoized).

**Tech Stack:** React 19 / Next 16, tRPC v11, `@dnd-kit/*` (already installed), Vitest (node).

**Prereq:** WS1 complete (shares the `invoices` router file).

---

### Task 1: `invoices.lastForClient` query (copy-previous data source)

**Files:**
- Modify: `src/server/routers/invoices.ts`
- Test: `src/test/routers-invoices-last-for-client.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { invoicesRouter } from "@/server/routers/invoices";
import { createMockContext } from "./mocks/trpc-context";

describe("invoices.lastForClient", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof invoicesRouter.createCaller>;
  beforeEach(() => {
    ctx = createMockContext();
    caller = invoicesRouter.createCaller(ctx);
  });

  it("returns the client's most recent invoice's copyable fields, org-scoped", async () => {
    ctx.db.invoice.findFirst.mockResolvedValue({
      id: "inv_9", type: "DETAILED", currencyId: "cur_1", notes: "Net 30",
      lines: [{ type: "STANDARD", description: "Design", qty: 2, rate: 50, sort: 0, taxes: [{ taxId: "t1" }] }],
    });

    const result = await caller.lastForClient({ clientId: "c1" });

    expect(ctx.db.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "test-org-123", clientId: "c1" },
        orderBy: { date: "desc" },
      }),
    );
    expect(result).toMatchObject({
      type: "DETAILED",
      currencyId: "cur_1",
      lines: [{ description: "Design", qty: 2, rate: 50, taxIds: ["t1"] }],
    });
  });

  it("returns null when the client has no invoices", async () => {
    ctx.db.invoice.findFirst.mockResolvedValue(null);
    expect(await caller.lastForClient({ clientId: "c1" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/routers-invoices-last-for-client.test.ts`
Expected: FAIL — `caller.lastForClient is not a function`.

- [ ] **Step 3: Add the procedure**

Add to `invoicesRouter` in `src/server/routers/invoices.ts`:

```ts
  lastForClient: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const last = await ctx.db.invoice.findFirst({
        where: { organizationId: ctx.orgId, clientId: input.clientId },
        orderBy: { date: "desc" },
        select: {
          type: true,
          currencyId: true,
          notes: true,
          lines: {
            select: { type: true, description: true, qty: true, rate: true, sort: true, taxes: { select: { taxId: true } } },
            orderBy: { sort: "asc" },
          },
        },
      });
      if (!last) return null;
      return {
        type: last.type,
        currencyId: last.currencyId,
        notes: last.notes,
        lines: last.lines.map((l) => ({
          type: l.type,
          description: l.description,
          qty: Number(l.qty),
          rate: Number(l.rate),
          taxIds: l.taxes.map((t) => t.taxId),
        })),
      };
    }),
```

> Note: verify the `InvoiceLine` relation field name for taxes (`taxes` vs `lineTaxes`/`invoiceLineTaxes`) and the line-item field names against `detailInvoiceInclude` in this file and `model InvoiceLine`/`InvoiceLineTax` in `prisma/schema.prisma`. Map the result to exactly the shape `InvoiceFormData.lines` expects (the `lineSchema` near the top of the router). Adjust `select` + mapping to match.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/routers-invoices-last-for-client.test.ts`
Expected: PASS (2 tests). Update the test's expected shape if the verified line field names differ.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/server/routers/invoices.ts src/test/routers-invoices-last-for-client.test.ts
git commit -m "feat(invoices): lastForClient query for copy-previous"
```

---

### Task 2: Pure keyboard-navigation helpers

Extract the editor's keyboard logic into a pure, node-testable module so behavior is provable without a DOM. (See the `pure-function-extraction-testing` skill.)

**Files:**
- Create: `src/components/invoices/line-item-keyboard.ts`
- Test: `src/test/line-item-keyboard.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { nextFocusOnEnter, duplicateRowAt, type RowRef } from "@/components/invoices/line-item-keyboard";

describe("line-item-keyboard", () => {
  it("nextFocusOnEnter on the last row signals a new row append", () => {
    expect(nextFocusOnEnter({ rowCount: 3, rowIndex: 2 })).toEqual({ action: "append", focusRow: 3 });
  });
  it("nextFocusOnEnter on a middle row moves focus to the next row", () => {
    expect(nextFocusOnEnter({ rowCount: 3, rowIndex: 0 })).toEqual({ action: "focus", focusRow: 1 });
  });
  it("duplicateRowAt clones the row and inserts it after the source", () => {
    const rows: RowRef[] = [{ description: "A", qty: 1, rate: 10 }, { description: "B", qty: 2, rate: 20 }];
    expect(duplicateRowAt(rows, 0)).toEqual([
      { description: "A", qty: 1, rate: 10 },
      { description: "A", qty: 1, rate: 10 },
      { description: "B", qty: 2, rate: 20 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/line-item-keyboard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

```ts
export type RowRef = { description: string; qty: number; rate: number; [k: string]: unknown };

export function nextFocusOnEnter(args: { rowCount: number; rowIndex: number }):
  { action: "append" | "focus"; focusRow: number } {
  const isLast = args.rowIndex >= args.rowCount - 1;
  return isLast
    ? { action: "append", focusRow: args.rowCount }
    : { action: "focus", focusRow: args.rowIndex + 1 };
}

export function duplicateRowAt<T>(rows: T[], index: number): T[] {
  if (index < 0 || index >= rows.length) return rows;
  const copy = { ...(rows[index] as object) } as T;
  return [...rows.slice(0, index + 1), copy, ...rows.slice(index + 1)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/line-item-keyboard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/invoices/line-item-keyboard.ts src/test/line-item-keyboard.test.ts
git commit -m "feat(invoices): pure keyboard-nav helpers for line items"
```

---

### Task 3: Fix InvoiceForm hydration (a11y F2)

`date: new Date().toISOString().slice(0, 10)` in the `useState` initializer (line ~70) runs on the server and the client and can mismatch around midnight UTC. Initialize empty and set on mount.

**Files:**
- Modify: `src/components/invoices/InvoiceForm.tsx`

- [ ] **Step 1: Make the initial `date` stable**

Change the initializer so `date` starts as `initialData?.date ?? ""` (no `new Date()` call during render):

```tsx
  const [form, setForm] = useState<InvoiceFormData>({
    type: InvoiceType.DETAILED,
    date: initialData?.date ?? "",
    dueDate: "",
    currencyId: defaultCurrency?.id ?? "",
    clientId: "",
    notes: "",
    lines: [],
    reminderDaysOverride: initialData?.reminderDaysOverride ?? [],
    ...initialData,
  });
```

- [ ] **Step 2: Set today's date after mount (new invoices only)**

Add near the other `useEffect`s:

```tsx
  // Default the date to "today" on the client only, so SSR and first client
  // render agree (avoids a hydration mismatch around the UTC date boundary).
  useEffect(() => {
    if (mode === "create" && !form.date) {
      setForm((f) => ({ ...f, date: new Date().toISOString().slice(0, 10) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

> Note: confirm the `mode` prop values (`"create"`/`"edit"`) used in this file and reuse them verbatim. Apply the same `new Date()`-in-initializer → `useEffect` fix to `src/components/projects/TimeEntryForm.tsx` and `src/components/.../MfaEnrollment.tsx` (grep `new Date()` / `Math.random()` in `useState(` initializers in those files).

- [ ] **Step 3: Typecheck + verify**

Run: `npx tsc --noEmit && npm test`
Expected: clean; existing invoice tests still green. Manually load `/invoices/new` (use the `run` skill) — date prefills to today, no console hydration warning.

- [ ] **Step 4: Commit**

```bash
git add src/components/invoices/InvoiceForm.tsx src/components/projects/TimeEntryForm.tsx
git commit -m "fix(a11y): move date/random init out of useState to fix hydration (F2)"
```

---

### Task 4: Extract InvoiceForm sections (a11y F4)

Split the 724-line `InvoiceForm.tsx` into focused children. Behavior-preserving — no test changes expected.

**Files:**
- Create: `src/components/invoices/InvoiceMetadata.tsx` (client, date, dueDate, type, currency, notes)
- Create: `src/components/invoices/PaymentScheduleSection.tsx` (schedule/deposit/partial terms)
- Modify: `src/components/invoices/InvoiceForm.tsx` (compose the two children, pass state + setters via props)

- [ ] **Step 1: Extract `<InvoiceMetadata>`**

Move the metadata JSX block out of `InvoiceForm` into `InvoiceMetadata.tsx` as a presentational component receiving `{ form, setForm, clients, currencies }` (use the existing `InvoiceFormData` type — export it from `InvoiceForm.tsx` or a shared `types.ts` if not already exported). Render `<InvoiceMetadata … />` in its place.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Extract `<PaymentScheduleSection>`**

Move the schedule/deposit JSX + handlers into `PaymentScheduleSection.tsx` receiving `{ schedule, setSchedule, depositEnabled, setDepositEnabled, depositPercent, setDepositPercent, scheduleOpen, setScheduleOpen }`. Render in place.

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean; all tests pass.

> **CRITICAL — no test covers this.** The codebase has **0 `.tsx` tests**, so a green suite + clean `tsc` does NOT prove the extraction preserved behavior. Threading state/setters into the extracted children can silently drop a binding and still compile. The verification below is mandatory, not optional.

- [ ] **Step 5: Mandatory before/after behavioral verification + commit**

Use the `verify` skill. Do an explicit functional exercise of BOTH flows — do not eyeball "renders identically":
- **Create:** `/invoices/new` → fill client, dates, type, currency, notes, add 2 line items, set a payment schedule/deposit → submit → confirm the saved invoice's payload (all fields + lines + schedule) is correct in the detail view.
- **Edit:** open an existing invoice's edit page → change a metadata field and a schedule value → save → confirm the change persisted and nothing else regressed.
Only commit once both round-trips are confirmed correct.

```bash
git add src/components/invoices/InvoiceMetadata.tsx src/components/invoices/PaymentScheduleSection.tsx src/components/invoices/InvoiceForm.tsx
git commit -m "refactor(a11y): extract InvoiceMetadata + PaymentScheduleSection (F4)"
```

---

### Task 5: Wire keyboard entry into LineItemEditor

Use the Task-2 helpers to add Enter→new-row and ⌘/Ctrl+D duplicate.

**Files:**
- Modify: `src/components/invoices/LineItemEditor.tsx`

- [ ] **Step 1: Add keydown handling on row inputs**

In `SortableLineItemImpl`, add an `onKeyDown` on the row's description/last input that:
- On `Enter` (no shift): `e.preventDefault()`, call a passed `onEnter(index)` prop which uses `nextFocusOnEnter` to append-or-focus.
- On `(e.metaKey||e.ctrlKey) && e.key === "d"`: `e.preventDefault()`, call `onDuplicate(index)`.

In the `LineItemEditor` parent, implement `onEnter`/`onDuplicate`:

```tsx
import { nextFocusOnEnter, duplicateRowAt } from "./line-item-keyboard";
// onEnter:
const decision = nextFocusOnEnter({ rowCount: lines.length, rowIndex: index });
if (decision.action === "append") addLine();           // existing add handler
// focus management: after render, focus the row at decision.focusRow's first input (use a ref map)
// onDuplicate:
onChangeRef.current(duplicateRowAt(linesRef.current, index));
```

> Note: reuse the editor's existing add-line handler (find the `addLine`/`add` callback already present) rather than re-implementing append. Focus management uses a `Map<number, HTMLInputElement|null>` of row refs; this is UI-only and verified manually.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Manual verify**

Load `/invoices/new` (use `run` skill): typing in the last row + Enter creates a new row and focuses it; ⌘/Ctrl+D duplicates the current row.

- [ ] **Step 4: Commit**

```bash
git add src/components/invoices/LineItemEditor.tsx
git commit -m "feat(invoices): keyboard line-item entry (Enter=new row, Cmd+D=duplicate)"
```

---

### Task 6: Shortcuts popover + copy-previous control

**Files:**
- Modify: `src/components/invoices/InvoiceForm.tsx` (copy-previous button + shortcuts popover)

- [ ] **Step 1: Add "Copy from previous"**

When a `clientId` is selected and `mode === "create"`, show a button that calls `invoices.lastForClient`:

```tsx
// lastForClient is a query — fetch it imperatively on demand via useUtils.
const utils = trpc.useUtils();
async function copyPrevious() {
  if (!form.clientId) return;
  const prev = await utils.invoices.lastForClient.fetch({ clientId: form.clientId });
  if (!prev) { toast.error("No previous invoice for this client"); return; }
  setForm((f) => ({ ...f, type: prev.type, currencyId: prev.currencyId, notes: prev.notes ?? f.notes, lines: prev.lines }));
  toast.success("Copied from previous invoice");
}
```

Render a `<Button variant="outline" type="button" onClick={copyPrevious} disabled={!form.clientId}>Copy from previous</Button>` near the line-items header.

- [ ] **Step 2: Add a shortcuts popover**

Add a small "?" button opening a popover (shadcn `Popover` if present, else a `Dialog`) listing: `Enter` — new row · `⌘/Ctrl+D` — duplicate row · drag handle / arrow keys — reorder.

- [ ] **Step 3: Typecheck + verify + commit**

Run: `npx tsc --noEmit`
Manual: select a client with prior invoices → "Copy from previous" prefills lines; shortcuts popover lists the keys.

```bash
git add src/components/invoices/InvoiceForm.tsx
git commit -m "feat(invoices): copy-previous-invoice + keyboard shortcuts popover"
```

---

### Task 7: Drag-reorder announcer (a11y F7)

KeyboardSensor is already wired; add screen-reader announcements.

**Files:**
- Modify: `src/components/invoices/LineItemEditor.tsx`

- [ ] **Step 1: Add an `aria-live` announcer + DndContext announcements**

Add a visually-hidden live region and DnD-Kit `announcements`:

```tsx
const [announcement, setAnnouncement] = useState("");
// ...
<DndContext
  /* existing sensors/handlers */
  accessibility={{
    announcements: {
      onDragStart: ({ active }) => `Picked up line item ${Number(active.id) + 1}.`,
      onDragOver: ({ active, over }) => over ? `Line item ${Number(active.id) + 1} moved to position ${Number(over.id) + 1}.` : "",
      onDragEnd: ({ active, over }) => over ? `Line item ${Number(active.id) + 1} dropped at position ${Number(over.id) + 1}.` : `Line item ${Number(active.id) + 1} dropped.`,
      onDragCancel: ({ active }) => `Reordering cancelled for line item ${Number(active.id) + 1}.`,
    },
  }}
>
```

> Note: DnD-Kit's built-in `accessibility.announcements` already renders its own live region — prefer that over a hand-rolled one. Confirm the `id` values are numeric sort indices (the file uses `line.sort` as the id); if they're not contiguous 0-based, map to display position instead of `Number(id)+1`.

- [ ] **Step 2: Typecheck + verify + commit**

Run: `npx tsc --noEmit`
Manual: focus a drag handle, use Space + arrows; a screen reader (or the DOM live region) announces the moves.

```bash
git add src/components/invoices/LineItemEditor.tsx
git commit -m "feat(a11y): drag-reorder announcements for line items (F7)"
```

---

### Task 8: Workstream verification

- [ ] **Step 1: Full suite + typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: clean; all tests pass.

- [ ] **Step 2: Manual end-to-end (use `verify` skill)**

Create an invoice entirely by keyboard: select client → Copy from previous (or add rows via Enter) → duplicate a row → reorder by keyboard → save. Confirm totals and saved data are correct.

---

## Self-review notes
- **Spec coverage (WS2):** component extraction (F4) ✅, hydration (F2) ✅, keyboard entry ✅, copy-previous ✅, keyboard DnD + announcer (F7) ✅. The KeyboardSensor was already present — plan adjusts F7 to the announcer-only gap.
- **Verify-during-wiring flags:** InvoiceLine tax relation name, `mode` prop values, `addLine` handler name, sort-id contiguity, Popover availability. All called out as `> Note:`.
- **Type consistency:** `RowRef`/helpers in Task 2 are used by Task 5; `InvoiceFormData` reused (exported) across extracted children.
