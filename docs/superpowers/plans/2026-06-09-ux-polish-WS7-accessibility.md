# WS7 — Accessibility Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining audit accessibility items not covered by WS2: F1 (label/`htmlFor` association), F3 (skip-link), and F6 (extract a shared, tested `useBulkSelection` hook). (F2/F4/F7 are delivered in WS2; F5 react-hook-form is out of scope per the spec.)

**Architecture:** F1/F3 are surgical JSX edits verified by `tsc` + manual. F6 extracts the duplicated invoice bulk-selection logic into a hook whose **pure state transitions** are unit-tested in node (per the `pure-function-extraction-testing` skill), then consumed by both the desktop and mobile bulk lists.

**Tech Stack:** React, the existing `@/components/ui/label` (`<Label htmlFor>`), Vitest (node).

**Prereq:** none (independent). Coordinate with WS2 if both touch `TimeEntryForm.tsx` — run WS7 after WS2, or rebase F1's TimeEntryForm edits onto WS2's hydration changes.

---

### Task 1: Label association (a11y F1) — TimeEntryForm

`TimeEntryForm.tsx` has 9 non-wrapping bare `<label>` elements (lines ~156, 186, 217, 228, 250, 264, 274, 298) that are not associated with their inputs.

**Files:**
- Modify: `src/components/projects/TimeEntryForm.tsx`

- [ ] **Step 1: Associate each label with its control**

For each bare `<label className="text-sm font-medium">X</label>` followed by an input/select, give the control a stable `id` and the label a matching `htmlFor` (or convert to the shared `<Label htmlFor>` component). Example:

```tsx
// before
<label className="text-sm font-medium">Date</label>
<input type="date" … />
// after
<Label htmlFor="te-date">Date</Label>
<input id="te-date" type="date" … />
```

Import `Label` from `@/components/ui/label` if not already. IDs: `te-log-against`, `te-retainer`, `te-date`, `te-task`, `te-time`, `te-start`, `te-end`, `te-note` (one per control; keep them unique within the form).

> Note: some `<label>`s wrap their input (`<label className="flex items-center gap-1"><input …/></label>`) — those are already implicitly associated; leave them. Only fix label→separate-input pairs. Verify each control is a single element; for grouped controls (e.g. a radio group) use a `<fieldset><legend>` instead of `htmlFor`.

- [ ] **Step 2: Sweep for other bare labels**

Run: `grep -rn '<label' src/components --include=*.tsx | grep -v 'htmlFor' | grep -v '<Label'`
Fix any other non-wrapping offenders found (the audit named `RetainerForm.tsx` — it mostly uses `<Label htmlFor>` already; only its two radio `<label>`s wrap their inputs, so leave them).

- [ ] **Step 3: Typecheck + verify + commit**

Run: `npx tsc --noEmit`
Manual (use `run` skill): open the time-entry form, click each label text → focus moves to its control (proves association).

```bash
git add src/components/projects/TimeEntryForm.tsx
git commit -m "fix(a11y): associate form labels with controls via htmlFor (F1)"
```

---

### Task 2: Skip link (a11y F3)

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx` (skip link + `id="main"`)

- [ ] **Step 1: Add `id="main"` to the main element**

The `<main className="flex-1 …">` (around line 116) gets `id="main"`:

```tsx
<main id="main" className="flex-1 lg:bg-card lg:rounded-2xl lg:shadow-sm lg:ring-1 lg:ring-border/40 lg:overflow-auto">
```

- [ ] **Step 2: Add the skip link as the first focusable element**

As the very first child of the layout's outermost returned element (before the sidebar/nav), add:

```tsx
<a
  href="#main"
  className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg"
>
  Skip to main content
</a>
```

> Note: confirm `sr-only` / `not-sr-only` utilities exist (Tailwind v4 default — they do). The link must be the first element in tab order, so place it before the sidebar markup in the JSX.

- [ ] **Step 3: Typecheck + verify + commit**

Run: `npx tsc --noEmit`
Manual (use `run` skill): load any dashboard page, press Tab once → "Skip to main content" appears and focuses; Enter jumps focus to `#main`.

```bash
git add "src/app/(dashboard)/layout.tsx"
git commit -m "feat(a11y): skip-to-main-content link (F3)"
```

---

### Task 3: Extract pure bulk-selection logic + `useBulkSelection` hook (a11y F6)

`InvoiceTableWithBulk.tsx` and `InvoiceMobileListWithBulk.tsx` duplicate select-all/toggle/clear logic over a `Set<string>`. Extract the pure transitions, test them, then build the hook on top.

**Files:**
- Create: `src/lib/bulk-selection.ts` (pure transitions)
- Create: `src/hooks/useBulkSelection.ts` (React hook over the pure transitions)
- Test: `src/test/bulk-selection.test.ts` (create)
- Modify: `src/components/invoices/InvoiceTableWithBulk.tsx`, `src/components/invoices/InvoiceMobileListWithBulk.tsx`

- [ ] **Step 1: Write the failing test (pure transitions)**

```ts
import { describe, it, expect } from "vitest";
import { toggleId, toggleAll, isAllSelected, clearSelection } from "@/lib/bulk-selection";

describe("bulk-selection transitions", () => {
  it("toggleId adds then removes an id", () => {
    const a = toggleId(new Set<string>(), "x");
    expect([...a]).toEqual(["x"]);
    const b = toggleId(a, "x");
    expect([...b]).toEqual([]);
  });

  it("toggleAll selects all when none/partial selected, clears when all selected", () => {
    const ids = ["a", "b", "c"];
    const all = toggleAll(new Set(["a"]), ids);
    expect(isAllSelected(all, ids)).toBe(true);
    const none = toggleAll(all, ids);
    expect(none.size).toBe(0);
  });

  it("isAllSelected is false for an empty id list", () => {
    expect(isAllSelected(new Set(), [])).toBe(false);
  });

  it("clearSelection returns an empty set", () => {
    expect(clearSelection().size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/bulk-selection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure transitions**

`src/lib/bulk-selection.ts`:

```ts
export function toggleId(selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function isAllSelected(selected: Set<string>, ids: string[]): boolean {
  return ids.length > 0 && ids.every((id) => selected.has(id));
}

export function toggleAll(selected: Set<string>, ids: string[]): Set<string> {
  return isAllSelected(selected, ids) ? new Set() : new Set(ids);
}

export function clearSelection(): Set<string> {
  return new Set();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/bulk-selection.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Build the hook over the pure transitions**

`src/hooks/useBulkSelection.ts`:

```ts
import { useCallback, useState } from "react";
import { toggleId, toggleAll, isAllSelected, clearSelection } from "@/lib/bulk-selection";

export function useBulkSelection(allIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = useCallback((id: string) => setSelected((s) => toggleId(s, id)), []);
  const toggleAllIds = useCallback(() => setSelected((s) => toggleAll(s, allIds)), [allIds]);
  const clear = useCallback(() => setSelected(clearSelection()), []);
  return {
    selected,
    selectedIds: Array.from(selected),
    allSelected: isAllSelected(selected, allIds),
    someSelected: selected.size > 0,
    toggle,
    toggleAll: toggleAllIds,
    clear,
  };
}
```

- [ ] **Step 6: Refactor both bulk lists to use the hook**

In `InvoiceTableWithBulk.tsx`, replace the local `selected` state + `allSelected`/`someSelected`/`toggleAll`/`toggle`/`selectedIds` definitions with:

```tsx
const { selected, selectedIds, allSelected, someSelected, toggle, toggleAll, clear } = useBulkSelection(allIds);
```

Keep `selectedInvoices`/`hasSendable`/etc. as derived locals. Do the same in `InvoiceMobileListWithBulk.tsx`. Remove now-dead `useState`/`useCallback` imports if unused.

> Note: confirm the existing field names match the hook's return (`selected`, `selectedIds`, `allSelected`, `someSelected`, `toggle`, `toggleAll`); the desktop component already uses exactly these names per the WS-context reading, so the swap is mechanical. Verify `clear()` is called where the component previously did `setSelected(new Set())` (e.g. after a successful bulk mutation).

- [ ] **Step 7: Typecheck + full suite + verify + commit**

Run: `npx tsc --noEmit && npm test`
Manual (use `verify` skill): on the invoices list (desktop + mobile), select-all toggles all, individual toggles work, partial-selection state shows, and a bulk action clears the selection.

```bash
git add src/lib/bulk-selection.ts src/hooks/useBulkSelection.ts src/test/bulk-selection.test.ts src/components/invoices/InvoiceTableWithBulk.tsx src/components/invoices/InvoiceMobileListWithBulk.tsx
git commit -m "refactor(a11y): shared tested useBulkSelection hook (F6)"
```

---

### Task 4: Workstream verification

- [ ] **Step 1:** `npx tsc --noEmit && npm test` — clean, all pass.
- [ ] **Step 2:** Manual (use `verify` skill): keyboard-only sweep — Tab from page load hits the skip link first; form labels focus their controls on click; bulk selection works identically on desktop and mobile.

---

## Self-review notes
- **Spec coverage (WS7):** F1 labels ✅, F3 skip-link ✅, F6 `useBulkSelection` (extracted + tested + adopted in both lists) ✅. F2/F4/F7 intentionally in WS2; F5 out of scope.
- **Verify-during-wiring:** wrapping vs separate labels in TimeEntryForm; `sr-only` utilities; exact field-name parity in the two bulk components; `clear()` call sites.
- **Type consistency:** `useBulkSelection` return shape ↔ the destructured names in both components; pure transitions in `bulk-selection.ts` are the single source consumed by the hook.
- **WS2 overlap:** TimeEntryForm is touched by both WS2 (F2 hydration) and WS7 (F1 labels). Execute WS7 after WS2 (it already is, by INDEX order) and rebase if needed.
