# WS3 — Command Palette Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Cmd+K palette from search/navigation into an action surface: Create invoice, Send reminder, Log expense, Start timer, Generate report — the in-place ones (reminder/expense/timer/report) mount the WS1 primitives without leaving the keyboard.

**Architecture:** Add an "Actions" `Command.Group` to `CommandPalette.tsx` plus a small `activeAction` state. Selecting an in-place action sets `activeAction` and opens the corresponding WS1 primitive (as a stacked dialog over the palette). "Create invoice" navigates. This is UI wiring over WS1 — verified via `tsc` + manual; no new procedures.

**Tech Stack:** `cmdk`, shadcn Dialog, the WS1 `src/components/actions/*` primitives.

**Prereq:** WS1 complete.

---

### Task 1: Add an Actions group + action state to CommandPalette

**Files:**
- Modify: `src/components/layout/CommandPalette.tsx`
- Reference: `src/components/actions/index.ts` (WS1 barrel: `QuickExpenseSheet`, `SendReminderInvoicePicker`, `StartTimerFlow`, `GenerateReportMenu`)

- [ ] **Step 1: Import primitives + add action state**

At the top of `CommandPalette`:

```tsx
import {
  QuickExpenseSheet,
  SendReminderInvoicePicker,
  StartTimerFlow,
  GenerateReportMenu,
} from "@/components/actions";

type PaletteAction = "expense" | "reminder" | "timer" | "report" | null;
const [activeAction, setActiveAction] = useState<PaletteAction>(null);
```

- [ ] **Step 2: Render the Actions group (shown when there's no search query)**

Inside `Command.List`, in the `{!showResults && (…)}` branch (next to "Quick Actions"), add:

```tsx
<Command.Group heading="Actions">
  <Command.Item value="action-create-invoice" onSelect={() => navigate("/invoices/new")} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent">
    <Plus className="h-4 w-4 text-muted-foreground" /> Create invoice
  </Command.Item>
  <Command.Item value="action-send-reminder" onSelect={() => { setOpen(false); setActiveAction("reminder"); }} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent">
    <Send className="h-4 w-4 text-muted-foreground" /> Send reminder
  </Command.Item>
  <Command.Item value="action-log-expense" onSelect={() => { setOpen(false); setActiveAction("expense"); }} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent">
    <Receipt className="h-4 w-4 text-muted-foreground" /> Log expense
  </Command.Item>
  <Command.Item value="action-start-timer" onSelect={() => { setOpen(false); setActiveAction("timer"); }} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent">
    <Clock className="h-4 w-4 text-muted-foreground" /> Start timer
  </Command.Item>
  <Command.Item value="action-generate-report" onSelect={() => { setOpen(false); setActiveAction("report"); }} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent">
    <BarChart3 className="h-4 w-4 text-muted-foreground" /> Generate report
  </Command.Item>
</Command.Group>
```

Add `Send`, `Clock` to the existing `lucide-react` import (`BarChart3`, `Plus`, `Receipt` are already imported).

- [ ] **Step 3: Mount the primitives outside the palette Dialog**

After the palette `<Dialog>…</Dialog>` (still inside the component's returned fragment — wrap the return in a `<>…</>` if it isn't already):

```tsx
<QuickExpenseSheet open={activeAction === "expense"} onOpenChange={(o) => !o && setActiveAction(null)} />
<SendReminderInvoicePicker open={activeAction === "reminder"} onOpenChange={(o) => !o && setActiveAction(null)} />
<StartTimerFlow open={activeAction === "timer"} onOpenChange={(o) => !o && setActiveAction(null)} />
<GenerateReportMenu open={activeAction === "report"} onOpenChange={(o) => !o && setActiveAction(null)} />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Manual verify (use `run` skill)**

Open Cmd+K → "Actions" group shows the five entries. "Log expense" opens the expense sheet; "Send reminder" opens the invoice picker → reminder draft; "Start timer" opens the project/task picker; "Generate report" opens the report menu; "Create invoice" navigates to `/invoices/new`.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/CommandPalette.tsx
git commit -m "feat(palette): unified command-palette actions (#1)"
```

---

### Task 2: Workstream verification

- [ ] **Step 1:** Run `npx tsc --noEmit && npm test` — clean, all pass.
- [ ] **Step 2:** Manual (use `verify` skill): from a cold load, drive each action to completion via keyboard only; confirm the palette closes and the action's success toast/navigation fires.

---

## Self-review notes
- **Spec coverage (WS3):** all five palette actions wired to WS1 primitives / navigation. ✅
- **Verify-during-wiring:** if the existing return isn't a fragment, wrap it so the primitives can mount as siblings. Confirm `setOpen`/`navigate` are the actual symbols in this file (they are, per the WS-context reading).
- **Type consistency:** `PaletteAction` union ↔ the four `activeAction ===` checks match exactly.
