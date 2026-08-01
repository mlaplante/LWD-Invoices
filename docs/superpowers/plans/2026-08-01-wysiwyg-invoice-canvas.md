# WYSIWYG Invoice Canvas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-08-01-wysiwyg-invoice-canvas-design.md`
**Goal:** Add a FreshBooks-style live-edit invoice canvas as a Form | Canvas toggle inside the existing invoice editor, with DRAFT-only autosave.
**Architecture:** UI-layer feature: a new `src/components/invoices/canvas/` component family renders the existing `InvoiceFormData` state as an inline-editable paper invoice; `InvoiceForm` keeps owning state and gains the toggle + an autosave hook. One server change: line names become optional while an invoice is in DRAFT (enforced again at send time and for SENT-invoice edits).
**Tech Stack:** Next.js 16 App Router, React 19, tRPC v11, zod, Tailwind v4 + shadcn/ui, `@dnd-kit`, vitest (node env — no DOM test tooling; UI verified via Playwright probe page).

## Global Constraints

- Money math is never computed in new code — always `calculateLineTotals` / `calculateInvoiceTotalsWithDiscount` from `@/server/services/tax-calculator` client-side, and server-side recomputation via `resolveInvoiceTax` (untouched).
- Org-scoping: every touched query keeps its `organizationId: ctx.orgId` filter exactly as-is (see lwd-architecture-contract).
- No Prisma schema changes, no migrations.
- No new dependencies.
- vitest runs in node environment — component tests must test pure logic modules, not rendered React. `npm run test:run -- <pattern>` to run.
- Sandbox verification ceiling: no DB, `npm run build` unavailable (runs `prisma migrate deploy`). `npx tsc --noEmit` + vitest are the sandbox bar; see final section.
- Commit after each task; commit messages follow existing repo style (`feat:`/`fix:` prefixes seen in git log are NOT used — messages are plain imperative sentences, e.g. "Add canvas theme mapping for invoice templates").

---

### Task 1: Server — draft-lenient line names + send-time guard

**Files:**
- Modify: `src/server/routers/invoices.ts` (lineSchema at ~47-60, `invoiceWriteSchema` at ~62, `update` at ~693)
- Modify: `src/server/services/invoice-send.ts` (`deliverInvoice`, ~line 27)
- Test: `src/test/routers-invoices-draft-lines.test.ts` (new)

**Interfaces:**
- Consumes: existing `lineSchema`, `invoiceWriteSchema`, `deliverInvoice(db, invoiceId, organizationId, options)`.
- Produces: exported `invoiceLinesAllNamed(lines: { name: string }[]): boolean` from `src/server/services/invoice-send.ts`; `invoiceWriteSchema` accepts empty line names; `update` rejects unnamed lines on SENT invoices; `deliverInvoice` throws `TRPCError BAD_REQUEST` on unnamed lines.

- [ ] **Step 1: Write the failing tests**

Create `src/test/routers-invoices-draft-lines.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { invoicesRouter } from "@/server/routers/invoices";
import { invoiceLinesAllNamed } from "@/server/services/invoice-send";
import { createMockContext } from "./mocks/trpc-context";

const emptyNameLine = {
  sort: 0,
  lineType: "STANDARD" as const,
  name: "",
  qty: 1,
  rate: 100,
  discount: 0,
  discountIsPercentage: false,
  taxIds: [] as string[],
};

describe("draft-lenient line names", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof invoicesRouter.createCaller>;
  beforeEach(() => {
    ctx = createMockContext();
    caller = invoicesRouter.createCaller(ctx);
  });

  it("invoiceLinesAllNamed is false for blank or whitespace names", () => {
    expect(invoiceLinesAllNamed([{ name: "Design" }])).toBe(true);
    expect(invoiceLinesAllNamed([{ name: "" }])).toBe(false);
    expect(invoiceLinesAllNamed([{ name: "   " }])).toBe(false);
    expect(invoiceLinesAllNamed([])).toBe(true);
  });

  it("update rejects unnamed lines when the stored invoice is SENT", async () => {
    ctx.db.organization.findFirst.mockResolvedValue({ id: "test-org-123" });
    ctx.db.invoice.findUnique.mockResolvedValue({ status: "SENT" });

    await expect(
      caller.update({
        id: "inv_1",
        currencyId: "cur_1",
        clientId: undefined,
        lines: [emptyNameLine],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Guard must fire before any tax work touches the DB further.
    expect(ctx.db.invoiceLine.deleteMany).not.toHaveBeenCalled();
    // Org-scoping: the status lookup must be tenant-filtered (Non-Negotiable #1).
    expect(ctx.db.invoice.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "test-org-123" }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- routers-invoices-draft-lines`
Expected: FAIL — `invoiceLinesAllNamed` is not exported (module has no such member), and the update call fails zod parsing (`name: String must contain at least 1 character(s)`) instead of the expected BAD_REQUEST from the status guard.

- [ ] **Step 3: Relax the write schema (keep `lineSchema` strict for change orders)**

In `src/server/routers/invoices.ts`, `lineSchema` stays exactly as-is (its `name: z.string().min(1)` still protects `createChangeOrder`, which requires named lines). Add directly below it:

```ts
// Draft-lenient variant: while an invoice is in DRAFT, autosave snapshots may
// legitimately contain rows the user is mid-typing. Non-DRAFT writes and
// send-time re-enforce non-empty names (see update's status guard and
// deliverInvoice's invoiceLinesAllNamed check).
const draftLineSchema = lineSchema.extend({ name: z.string().default("") });
```

and change `invoiceWriteSchema`'s lines field:

```ts
  lines: z.array(draftLineSchema).default([]),
```

- [ ] **Step 4: Guard SENT-invoice updates**

In the `update` mutation, immediately after the existing status check (the `if (existing.status !== InvoiceStatus.DRAFT && existing.status !== InvoiceStatus.SENT)` block ending ~line 724), add:

```ts
      // DRAFT invoices may hold unnamed mid-typing rows (autosave); a SENT
      // invoice is client-visible, so unnamed lines must never land on one.
      if (
        existing.status === InvoiceStatus.SENT &&
        input.lines?.some((l) => l.name.trim() === "")
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "All line items need a name before a sent invoice can be updated.",
        });
      }
```

- [ ] **Step 5: Guard send time**

In `src/server/services/invoice-send.ts`, add near the top (below the imports):

```ts
import { TRPCError } from "@trpc/server";

/** True when every line has a non-blank name. Empty invoices pass (unchanged
 * from today's behavior — this guard only covers unnamed rows). */
export function invoiceLinesAllNamed(lines: { name: string }[]): boolean {
  return lines.every((l) => l.name.trim() !== "");
}
```

and in `deliverInvoice`, immediately after the `if (!invoice) return null;` line:

```ts
  if (!invoiceLinesAllNamed(invoice.lines)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This invoice has unnamed line items. Name every line before sending.",
    });
  }
```

- [ ] **Step 6: Check the scheduled-sends cron tolerates the throw**

Open the Inngest function that calls `deliverInvoice` for scheduled sends (find it with `grep -rn "deliverInvoice" src/inngest/`). If its per-invoice loop does not already wrap the call in try/catch, wrap it so one unnamed-lines invoice fails that row (logged) without aborting the whole cron run. `sendMany` in the router (~line 1033) likewise: confirm its per-invoice loop catches per-item errors; if it doesn't, catch and collect the failure message per invoice instead of aborting the batch.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:run -- routers-invoices-draft-lines`
Expected: PASS.
Also run the neighbouring suites to catch regressions: `npm run test:run -- routers-invoices` and `npm run test:run -- invoices-bulk-mutations`
Expected: PASS (change-order tests still enforce named lines via strict `lineSchema`).

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/server/routers/invoices.ts src/server/services/invoice-send.ts src/test/routers-invoices-draft-lines.test.ts src/inngest/
git commit -m "Allow unnamed line items on DRAFT invoices, enforce names at send time"
```

**Dependencies:** None
**Estimated scope:** M

---

### Task 2: Canvas theme mapping (pure module)

**Files:**
- Create: `src/components/invoices/canvas/canvas-theme.ts`
- Test: `src/test/canvas-theme.test.ts`

**Interfaces:**
- Consumes: `InvoiceTemplateConfig` type from `@/server/services/invoice-template-config` (type-only import — the module has no server-only dependencies).
- Produces: `buildCanvasTheme(config: InvoiceTemplateConfig): CanvasTheme` where `CanvasTheme = { cssVars: Record<string, string>; density: "normal" | "compact"; headerStyle: "banded" | "ruled" | "plain" }`.

- [ ] **Step 1: Write the failing test**

Create `src/test/canvas-theme.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCanvasTheme } from "@/components/invoices/canvas/canvas-theme";

const base = {
  fontFamily: "Helvetica",
  accentColor: "#123456",
  showLogo: true,
  footerText: null,
} as const;

describe("buildCanvasTheme", () => {
  it("maps react-pdf font names to CSS stacks", () => {
    expect(
      buildCanvasTheme({ ...base, template: "modern" }).cssVars["--canvas-font"],
    ).toContain("Helvetica");
    expect(
      buildCanvasTheme({ ...base, template: "classic", fontFamily: "Times-Roman" })
        .cssVars["--canvas-font"],
    ).toContain("Georgia");
    expect(
      buildCanvasTheme({ ...base, template: "minimal", fontFamily: "Courier" })
        .cssVars["--canvas-font"],
    ).toContain("Courier");
  });

  it("passes accent color through as a CSS var", () => {
    expect(
      buildCanvasTheme({ ...base, template: "modern" }).cssVars["--canvas-accent"],
    ).toBe("#123456");
  });

  it("maps template to header style and density", () => {
    expect(buildCanvasTheme({ ...base, template: "modern" })).toMatchObject({
      headerStyle: "banded",
      density: "normal",
    });
    expect(buildCanvasTheme({ ...base, template: "classic" })).toMatchObject({
      headerStyle: "ruled",
      density: "normal",
    });
    expect(buildCanvasTheme({ ...base, template: "minimal" })).toMatchObject({
      headerStyle: "plain",
      density: "normal",
    });
    expect(buildCanvasTheme({ ...base, template: "compact" })).toMatchObject({
      headerStyle: "ruled",
      density: "compact",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- canvas-theme`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/components/invoices/canvas/canvas-theme.ts`:

```ts
import type { InvoiceTemplateConfig } from "@/server/services/invoice-template-config";

export type CanvasTheme = {
  cssVars: Record<string, string>;
  density: "normal" | "compact";
  headerStyle: "banded" | "ruled" | "plain";
};

// react-pdf built-in font names (see invoice-template-config FONT_MAP) → CSS stacks.
const CSS_FONT_STACKS: Record<string, string> = {
  Helvetica: "Helvetica, ui-sans-serif, Arial, sans-serif",
  "Times-Roman": "Georgia, 'Times New Roman', serif",
  Courier: "'Courier New', Courier, monospace",
};

const TEMPLATE_STYLE: Record<
  InvoiceTemplateConfig["template"],
  { headerStyle: CanvasTheme["headerStyle"]; density: CanvasTheme["density"] }
> = {
  modern: { headerStyle: "banded", density: "normal" },
  classic: { headerStyle: "ruled", density: "normal" },
  minimal: { headerStyle: "plain", density: "normal" },
  compact: { headerStyle: "ruled", density: "compact" },
};

export function buildCanvasTheme(config: InvoiceTemplateConfig): CanvasTheme {
  const { headerStyle, density } = TEMPLATE_STYLE[config.template];
  return {
    cssVars: {
      "--canvas-font": CSS_FONT_STACKS[config.fontFamily] ?? CSS_FONT_STACKS.Helvetica,
      "--canvas-accent": config.accentColor,
    },
    density,
    headerStyle,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- canvas-theme`
Expected: PASS. Then `npx tsc --noEmit` → clean. (If tsc flags the cross-boundary type import, switch to `import type` — already specified — or move the `InvoiceTemplateConfig` type to a shared location; do NOT import the config *function* into client code.)

- [ ] **Step 5: Commit**

```bash
git add src/components/invoices/canvas/canvas-theme.ts src/test/canvas-theme.test.ts
git commit -m "Add canvas theme mapping from invoice template config"
```

**Dependencies:** None
**Estimated scope:** S

---

### Task 3: Shared line-item utils (extract, no behavior change)

**Files:**
- Create: `src/components/invoices/line-item-utils.ts`
- Modify: `src/components/invoices/LineItemEditor.tsx` (remove local `newLine`/`computeLineResult`, import from utils)
- Test: `src/test/line-item-utils.test.ts`

**Interfaces:**
- Produces: `newLine(sort: number): LineItemValue` and `computeLineResult(line: LineItemValue, taxes: TaxOption[]): LineResult` plus the exported `TaxOption` type — consumed by both `LineItemEditor` and Task 5's `CanvasLineRows`.

- [ ] **Step 1: Create the utils module**

Create `src/components/invoices/line-item-utils.ts` by MOVING (not copying) the existing `newLine` and `computeLineResult` functions and the `TaxOption` type out of `LineItemEditor.tsx` (currently at ~lines 51-56, 89-118) verbatim:

```ts
import { LineType } from "@/generated/prisma";
import {
  calculateLineTotals,
  type TaxInput,
} from "@/server/services/tax-calculator";
import type { LineItemValue } from "./LineItemEditor";

export type TaxOption = {
  id: string;
  name: string;
  rate: number;
  isCompound: boolean;
};

export function computeLineResult(line: LineItemValue, taxes: TaxOption[]) {
  const taxInputs: TaxInput[] = taxes
    .filter((t) => line.taxIds.includes(t.id))
    .map((t) => ({ id: t.id, rate: t.rate, isCompound: t.isCompound }));
  return calculateLineTotals(
    {
      qty: line.qty,
      rate: line.rate,
      period: line.period,
      lineType: line.lineType,
      discount: line.discount,
      discountIsPercentage: line.discountIsPercentage,
      taxIds: line.taxIds,
    },
    taxInputs,
  );
}

export function newLine(sort: number): LineItemValue {
  return {
    sort,
    lineType: LineType.STANDARD,
    name: "",
    qty: 1,
    rate: 0,
    discount: 0,
    discountIsPercentage: false,
    taxIds: [],
  };
}
```

In `LineItemEditor.tsx`: delete the local copies, add
`import { newLine, computeLineResult, type TaxOption } from "./line-item-utils";`
and delete the now-unused local `TaxOption` type (keep the `LineItemValue` export where it is — `line-item-utils` imports it from `LineItemEditor`, which stays the type's home to avoid touching its many importers).

- [ ] **Step 2: Write the test**

Create `src/test/line-item-utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { newLine, computeLineResult } from "@/components/invoices/line-item-utils";
import { LineType } from "@/generated/prisma";

describe("line-item-utils", () => {
  it("newLine produces a standard empty row with the given sort", () => {
    expect(newLine(7)).toMatchObject({
      sort: 7,
      lineType: LineType.STANDARD,
      name: "",
      qty: 1,
      rate: 0,
      taxIds: [],
    });
  });

  it("computeLineResult applies only the line's selected taxes", () => {
    const line = { ...newLine(0), qty: 2, rate: 100, taxIds: ["t1"] };
    const taxes = [
      { id: "t1", name: "GST", rate: 10, isCompound: false },
      { id: "t2", name: "PST", rate: 50, isCompound: false },
    ];
    const result = computeLineResult(line, taxes);
    expect(result.subtotal).toBe(200);
    expect(result.taxTotal).toBe(20); // only t1, not t2
    expect(result.total).toBe(220);
  });
});
```

- [ ] **Step 3: Run tests + typecheck**

Run: `npm run test:run -- line-item-utils` → PASS.
Run: `npx tsc --noEmit` → clean (proves the LineItemEditor extraction left no dangling references).

- [ ] **Step 4: Commit**

```bash
git add src/components/invoices/line-item-utils.ts src/components/invoices/LineItemEditor.tsx src/test/line-item-utils.test.ts
git commit -m "Extract shared line-item helpers for reuse by the invoice canvas"
```

**Dependencies:** None
**Estimated scope:** S

---

### Task 4: Autosave core (pure) + React hook

**Files:**
- Create: `src/components/invoices/canvas/autosave-core.ts`
- Create: `src/components/invoices/canvas/useInvoiceAutosave.ts`
- Test: `src/test/invoice-autosave-core.test.ts`

**Interfaces:**
- Consumes: `InvoiceFormData` from `./InvoiceForm` (type import).
- Produces (from `autosave-core.ts`):
  - `type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error"`
  - `canAutosave(args: { invoiceStatus: "DRAFT" | "SENT"; clientId: string; currencyId: string; preflightBlocked: boolean }): boolean`
  - `nextAutosaveAction(args: { hasId: boolean; inFlight: boolean; dirty: boolean }): "create" | "update" | "wait" | "none"`
- Produces (from `useInvoiceAutosave.ts`):
  - `useInvoiceAutosave(opts): { status: AutosaveStatus; retry: () => void }` (full signature in Step 4).

- [ ] **Step 1: Write the failing core tests**

Create `src/test/invoice-autosave-core.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  canAutosave,
  nextAutosaveAction,
} from "@/components/invoices/canvas/autosave-core";

describe("canAutosave", () => {
  const ok = {
    invoiceStatus: "DRAFT" as const,
    clientId: "c1",
    currencyId: "cur1",
    preflightBlocked: false,
  };
  it("allows DRAFT with client + currency and no preflight block", () => {
    expect(canAutosave(ok)).toBe(true);
  });
  it("never autosaves SENT invoices", () => {
    expect(canAutosave({ ...ok, invoiceStatus: "SENT" })).toBe(false);
  });
  it("requires a client (the meaningful-change gate)", () => {
    expect(canAutosave({ ...ok, clientId: "" })).toBe(false);
  });
  it("requires a currency", () => {
    expect(canAutosave({ ...ok, currencyId: "" })).toBe(false);
  });
  it("holds off while Stripe Tax preflight reports missing fields", () => {
    expect(canAutosave({ ...ok, preflightBlocked: true })).toBe(false);
  });
});

describe("nextAutosaveAction", () => {
  it("creates when dirty with no id and nothing in flight", () => {
    expect(nextAutosaveAction({ hasId: false, inFlight: false, dirty: true })).toBe("create");
  });
  it("updates when dirty with an id and nothing in flight", () => {
    expect(nextAutosaveAction({ hasId: true, inFlight: false, dirty: true })).toBe("update");
  });
  it("waits (queues) while a save is in flight", () => {
    expect(nextAutosaveAction({ hasId: true, inFlight: true, dirty: true })).toBe("wait");
  });
  it("does nothing when clean", () => {
    expect(nextAutosaveAction({ hasId: true, inFlight: false, dirty: false })).toBe("none");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- invoice-autosave-core`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the core**

Create `src/components/invoices/canvas/autosave-core.ts`:

```ts
export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export const AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * DRAFT-only autosave gate. clientId + currencyId are the server write
 * schema's hard requirements (both z.string().min(1)); preflightBlocked
 * mirrors the Save buttons' stripeTaxPreflight guard so autosave never
 * fires a write the server is guaranteed to reject.
 */
export function canAutosave(args: {
  invoiceStatus: "DRAFT" | "SENT";
  clientId: string;
  currencyId: string;
  preflightBlocked: boolean;
}): boolean {
  return (
    args.invoiceStatus === "DRAFT" &&
    args.clientId !== "" &&
    args.currencyId !== "" &&
    !args.preflightBlocked
  );
}

/** Single-flight scheduler decision: at most one save in flight; a change
 * arriving mid-save waits and re-fires with the latest snapshot after. */
export function nextAutosaveAction(args: {
  hasId: boolean;
  inFlight: boolean;
  dirty: boolean;
}): "create" | "update" | "wait" | "none" {
  if (!args.dirty) return "none";
  if (args.inFlight) return "wait";
  return args.hasId ? "update" : "create";
}
```

- [ ] **Step 4: Implement the hook**

Create `src/components/invoices/canvas/useInvoiceAutosave.ts`:

```ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  AUTOSAVE_DEBOUNCE_MS,
  canAutosave,
  nextAutosaveAction,
  type AutosaveStatus,
} from "./autosave-core";

type SaveResult = { id: string };

export function useInvoiceAutosave(opts: {
  /** Gate inputs — recomputed every render by the caller. */
  invoiceStatus: "DRAFT" | "SENT";
  clientId: string;
  currencyId: string;
  preflightBlocked: boolean;
  /** Stable-ish identity not required; read via ref. */
  invoiceId: string | undefined;
  /** JSON-serializable snapshot of everything the write payload derives from.
   * The hook autosaves whenever this string changes. */
  snapshot: string;
  doCreate: () => Promise<SaveResult>;
  doUpdate: () => Promise<SaveResult>;
  onCreated: (id: string) => void;
}) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<string | null>(null);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const runSave = useCallback(async () => {
    const o = optsRef.current;
    const dirty = lastSavedSnapshotRef.current !== o.snapshot;
    const action = nextAutosaveAction({
      hasId: Boolean(o.invoiceId),
      inFlight: inFlightRef.current,
      dirty,
    });
    if (action === "none") return;
    if (action === "wait") {
      queuedRef.current = true;
      return;
    }

    inFlightRef.current = true;
    setStatus("saving");
    const snapshotAtSave = o.snapshot;
    try {
      if (action === "create") {
        const created = await o.doCreate();
        o.onCreated(created.id);
      } else {
        await o.doUpdate();
      }
      lastSavedSnapshotRef.current = snapshotAtSave;
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      inFlightRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        // Latest snapshot may differ from the one just saved — re-run.
        void runSave();
      }
    }
  }, []);

  useEffect(() => {
    const o = optsRef.current;
    if (
      !canAutosave({
        invoiceStatus: o.invoiceStatus,
        clientId: o.clientId,
        currencyId: o.currencyId,
        preflightBlocked: o.preflightBlocked,
      })
    ) {
      return;
    }
    if (lastSavedSnapshotRef.current === null) {
      // First render: treat the initial state as already-saved so opening an
      // existing draft (or an empty create page) never fires a write by itself.
      lastSavedSnapshotRef.current = opts.snapshot;
      return;
    }
    if (lastSavedSnapshotRef.current === opts.snapshot) return;

    setStatus("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void runSave(), AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [opts.snapshot, runSave]);

  const retry = useCallback(() => void runSave(), [runSave]);

  return { status, retry };
}
```

Design note locked here: on `create`, the caller's `onCreated` sets `form.id` and rewrites the URL with `window.history.replaceState(null, "", `/invoices/${id}/edit`)` — NOT `router.replace` — because a Next navigation would remount the server page and clobber in-progress typing. (Wired in Task 7.)

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test:run -- invoice-autosave-core` → PASS.
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/invoices/canvas/autosave-core.ts src/components/invoices/canvas/useInvoiceAutosave.ts src/test/invoice-autosave-core.test.ts
git commit -m "Add DRAFT-only invoice autosave core and hook"
```

**Dependencies:** None
**Estimated scope:** M

---

### Task 5: Editable primitives

**Files:**
- Create: `src/components/invoices/canvas/editable.tsx`

**Interfaces:**
- Produces:
  - `EditableText({ value, onCommit, placeholder?, multiline?, className?, ariaLabel })` — text until focus, `Input`/`Textarea` while editing; commit on blur/Enter (Enter commits single-line; multiline commits on blur only), Escape reverts.
  - `EditableNumber({ value, onCommit, format, className?, ariaLabel, disabled? })` — renders `format(value)` (e.g. currency) as text, numeric `Input` while editing.
  - `EditableDate({ value, onCommit, ariaLabel, displayFormat? })` — formatted date as text, `<Input type="date">` while editing.

No new dependencies; shadcn `Input`/`Textarea` only. Vitest cannot render these (node env) — behavior is verified in Task 8's Playwright pass; keep all non-trivial logic in the primitives thin and obvious.

- [ ] **Step 1: Implement**

Create `src/components/invoices/canvas/editable.tsx`:

```tsx
"use client";

import React, { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Shared display wrapper: looks like document text, behaves like a button. */
function DisplayButton({
  onActivate,
  className,
  ariaLabel,
  children,
}: {
  onActivate: () => void;
  className?: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onActivate}
      onFocus={onActivate}
      className={`rounded-sm text-left hover:bg-[color-mix(in_oklch,var(--canvas-accent)_8%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--canvas-accent)] ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function EditableText({
  value,
  onCommit,
  placeholder,
  multiline = false,
  className,
  ariaLabel,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const revertedRef = useRef(false);

  function start() {
    setDraft(value);
    revertedRef.current = false;
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    if (!revertedRef.current && draft !== value) onCommit(draft);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      revertedRef.current = true;
      setEditing(false);
    } else if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      commit();
    }
  }

  if (!editing) {
    return (
      <DisplayButton onActivate={start} className={className} ariaLabel={ariaLabel}>
        {value !== "" ? (
          <span className="whitespace-pre-wrap">{value}</span>
        ) : (
          <span className="text-muted-foreground">{placeholder ?? "—"}</span>
        )}
      </DisplayButton>
    );
  }
  const shared = {
    autoFocus: true,
    value: draft,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown,
    placeholder,
    "aria-label": ariaLabel,
    className: `h-auto px-1 py-0.5 text-[length:inherit] font-[inherit] ${className ?? ""}`,
  };
  return multiline ? <Textarea rows={2} {...shared} /> : <Input {...shared} />;
}

export function EditableNumber({
  value,
  onCommit,
  format,
  className,
  ariaLabel,
  disabled = false,
}: {
  value: number;
  onCommit: (next: number) => void;
  format: (n: number) => string;
  className?: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const revertedRef = useRef(false);

  if (disabled) {
    return <span className={className}>{format(value)}</span>;
  }
  if (!editing) {
    return (
      <DisplayButton
        onActivate={() => {
          setDraft(String(value));
          revertedRef.current = false;
          setEditing(true);
        }}
        className={`tabular-nums ${className ?? ""}`}
        ariaLabel={ariaLabel}
      >
        {format(value)}
      </DisplayButton>
    );
  }
  function commit() {
    setEditing(false);
    if (revertedRef.current) return;
    const parsed = Number(draft);
    if (!Number.isNaN(parsed) && parsed !== value) onCommit(parsed);
  }
  return (
    <Input
      autoFocus
      type="number"
      step="any"
      min={0}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          revertedRef.current = true;
          setEditing(false);
        } else if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      aria-label={ariaLabel}
      className={`h-auto w-24 px-1 py-0.5 text-right text-[length:inherit] ${className ?? ""}`}
    />
  );
}

export function EditableDate({
  value,
  onCommit,
  ariaLabel,
}: {
  value: string; // YYYY-MM-DD or ""
  onCommit: (next: string) => void;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <DisplayButton onActivate={() => setEditing(true)} ariaLabel={ariaLabel}>
        {value !== "" ? value : <span className="text-muted-foreground">Set date</span>}
      </DisplayButton>
    );
  }
  return (
    <Input
      autoFocus
      type="date"
      value={value}
      onChange={(e) => onCommit(e.target.value)}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter") setEditing(false);
      }}
      aria-label={ariaLabel}
      className="h-auto w-40 px-1 py-0.5"
    />
  );
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/invoices/canvas/editable.tsx
git commit -m "Add inline-editable text, number, and date primitives for the invoice canvas"
```

**Dependencies:** None
**Estimated scope:** M

---

### Task 6: CanvasLineRows

**Files:**
- Create: `src/components/invoices/canvas/CanvasLineRows.tsx`

**Interfaces:**
- Consumes: `LineItemValue` (from `../LineItemEditor`), `newLine`/`computeLineResult`/`TaxOption` (Task 3), `EditableText`/`EditableNumber` (Task 5), `nextFocusOnEnter`/`duplicateRowAt` (`../line-item-keyboard`), `@dnd-kit` (same usage as `LineItemEditor`).
- Produces: `CanvasLineRows({ lines, taxes, currencySymbol, fmt, readOnly, onChange })` — `fmt: (n: number) => string` is the caller's currency formatter; `onChange(lines: LineItemValue[])` identical contract to `LineItemEditor`.

- [ ] **Step 1: Implement**

Create `src/components/invoices/canvas/CanvasLineRows.tsx`. Structure mirrors `LineItemEditor` exactly for state/callback mechanics (copy its ref-stabilized callback pattern: `linesRef`/`onChangeRef` + `useCallback` handlers + `React.memo` row; and its `DndContext`/`SortableContext` setup including the accessibility announcements block) but renders each row as invoice-document text instead of form controls:

- Row grid (desktop): `grid-cols-[1fr_90px_110px_110px_32px]` → Description | Qty | Rate | Amount | row-actions. Discount/period/taxes/line-type live in a per-row Popover (opened from a small "⋯" button that appears on row hover/focus-within) reusing the exact same controls as `LineItemEditor`'s cells (Select for line type, discount input + %/$ toggle, period input, tax toggle buttons) — the paper shows the *result*; secondary attributes edit in the popover. When a row has a discount/taxes, render a muted one-line summary under the name (e.g. `10% off · GST 10%`).
- Description cell: `EditableText` (name, placeholder "Item name") + optional second `EditableText multiline` (description) shown when non-empty or after the popover's "Add description" action.
- Qty/Rate: `EditableNumber` with `format={(n) => String(n)}` for qty and `format={fmt}` for rate; both `disabled` for discount line types (`PERCENTAGE_DISCOUNT`/`FIXED_DISCOUNT`), matching `LineItemEditor`'s disabling.
- Amount cell: read-only `computeLineResult(line, taxes).total` via `fmt` (never editable — computed).
- Keyboard: Enter in the name field uses `nextFocusOnEnter` + append via `newLine` (same as `LineItemEditor.handleEnter`), ⌘/Ctrl+D duplicates via `duplicateRowAt`.
- Trailing row: a full-width ghost row `+ Add a line` (button) that appends `newLine(sortCounter.current++)`; hidden when `readOnly`.
- `readOnly` mode: render every cell as plain text (no DisplayButton hover affordance), no drag handles, no popovers — this is the future portal-reuse surface.

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/invoices/canvas/CanvasLineRows.tsx
git commit -m "Add canvas line rows with inline editing and popover for secondary attributes"
```

**Dependencies:** Tasks 3, 5
**Estimated scope:** L

---

### Task 7: InvoiceCanvas assembly

**Files:**
- Create: `src/components/invoices/canvas/InvoiceCanvas.tsx`

**Interfaces:**
- Consumes: Tasks 2, 5, 6 outputs; `calculateInvoiceTotalsWithDiscount` (via props — see below); shadcn `Select`/`Popover`.
- Produces:

```ts
export type InvoiceCanvasProps = {
  value: InvoiceFormData;
  onChange: React.Dispatch<React.SetStateAction<InvoiceFormData>>;
  onClientChange: (clientId: string) => void; // InvoiceForm's handler (recalcs due date)
  onDateChange: (newDate: string) => void;    // InvoiceForm's handler
  readOnly?: boolean;
  clients: { id: string; name: string; defaultPaymentTermsDays: number | null }[];
  currencies: { id: string; code: string; symbol: string; symbolPosition: string }[];
  taxes: TaxOption[];
  totals: InvoiceTotalsWithDiscount; // computed by InvoiceForm, single source
  fmt: (n: number) => string;
  org: { name: string; logoUrl: string | null };
  theme: CanvasTheme;
  footerText: string | null;
};
```

- [ ] **Step 1: Implement**

Create `src/components/invoices/canvas/InvoiceCanvas.tsx` — a `max-w-[52rem]` white "sheet" (`bg-white text-neutral-900 shadow-md rounded-md` — the paper is deliberately light in both app themes, like a real document preview), `style={theme.cssVars}` and `font-[family-name:var(--canvas-font)]`:

1. **Header** per `theme.headerStyle`: `banded` = accent-filled band (`bg-[var(--canvas-accent)] text-white`) holding logo/org-name left and doc-type label right; `ruled` = white header with `border-t-4 border-[var(--canvas-accent)]`; `plain` = no accent, generous whitespace. Logo: render `<img src={org.logoUrl}>` when `config.showLogo && org.logoUrl`, else org name text. Doc-type label map: `SIMPLE`/`DETAILED`/`DEPOSIT` → "INVOICE", `ESTIMATE` → "ESTIMATE", `CREDIT_NOTE` → "CREDIT NOTE" (matches the PDF templates' `typeLabel`). Next to the label, a small inline `Select` (borderless trigger) for switching `value.type` — hidden when `readOnly`.
2. **Meta row**: invoice number (`EditableText`, only when `value.number !== undefined`, matching the form's edit-only behavior), issue date (`EditableDate` → `onDateChange`), due date (`EditableDate` → `onChange` dueDate), currency (inline borderless `Select` over `currencies`).
3. **Bill To**: when a client is set, its name in document type with a hover affordance opening an inline `Select` (over `clients`, firing `onClientChange`); when unset, a dashed-outline "Choose a client" button opening the same select. `readOnly` renders plain text.
4. **Lines**: `<CanvasLineRows lines={value.lines} taxes={taxes} fmt={fmt} readOnly={readOnly} onChange={(lines) => onChange((f) => ({ ...f, lines }))} />`.
5. **Totals block** (right-aligned, same rows as the form's totals panel — Subtotal / Discount / Tax / Total from the `totals` prop): the Discount row is interactive — clicking it (or a ghost "+ Discount" row when `discountType` is null) opens a small Popover with the exact three controls from `InvoiceForm`'s discount section (type Select, amount Input, description Input) writing through `onChange`. Total row emphasized with `border-t` and `text-[var(--canvas-accent)]`.
6. **Notes**: `EditableText multiline` bound to `value.notes`, placeholder "Payment terms, bank details, thank you message…".
7. **Footer**: `footerText` rendered muted at the sheet's bottom when present (read-only — it's org-level config).

The component computes nothing financial: totals arrive via props from `InvoiceForm`'s existing `calculateInvoiceTotalsWithDiscount` call.

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/invoices/canvas/InvoiceCanvas.tsx
git commit -m "Assemble the invoice canvas paper view"
```

**Dependencies:** Tasks 2, 5, 6
**Estimated scope:** L

---

### Task 8: InvoiceForm integration — toggle, side rail, autosave wiring, pages

**Files:**
- Modify: `src/components/invoices/InvoiceForm.tsx`
- Modify: `src/app/(dashboard)/invoices/new/page.tsx`
- Modify: `src/app/(dashboard)/invoices/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: Tasks 4, 7. New `InvoiceForm` props (all required from pages):
  - `invoiceStatus: "DRAFT" | "SENT"` (create page passes `"DRAFT"`; edit page passes the invoice's actual status — the page already restricts to DRAFT/SENT)
  - `templateConfig: InvoiceTemplateConfig` (pages compute server-side: `getInvoiceTemplateConfig(org)` — both pages already fetch the org; extend their org selection to include `name`, `logoUrl`, `brandColor`, `invoiceTemplate`, `invoiceFontFamily`, `invoiceAccentColor`, `invoiceShowLogo`, `invoiceFooterText`)
  - `orgDisplay: { name: string; logoUrl: string | null }`

- [ ] **Step 1: Add the view toggle**

In `InvoiceForm`, add:

```ts
const [view, setView] = useState<"form" | "canvas">("form");
useEffect(() => {
  const stored = window.localStorage.getItem("invoice-editor-view");
  if (stored === "canvas") setView("canvas");
}, []);
function switchView(v: "form" | "canvas") {
  setView(v);
  window.localStorage.setItem("invoice-editor-view", v);
}
```

Render a two-button segmented control (shadcn `Tabs` or two `Button variant={view === x ? "default" : "outline"}`) at the top of the editor labeled **Form** / **Preview edit**. (Default stays `"form"` per spec; localStorage read is in an effect so SSR markup matches the first client render.)

- [ ] **Step 2: Render the canvas branch**

When `view === "canvas"`, replace the form's `InvoiceMetadata` + `LineItemEditor` + discount + notes sections with a two-column layout: `InvoiceCanvas` (main, using the props from Task 7's interface — pass `theme={buildCanvasTheme(templateConfig)}`, `footerText={templateConfig.footerText}`, `totals={invoiceTotals}`, existing `handleClientChange`/`handleDateChange`) and a right side rail (collapsible on mobile via the existing `sm:` responsive patterns) containing the unchanged existing components: create-from-prompt panel (create mode), `PaymentScheduleSection`, `InvoiceDraftQA`, reminder-override block, duplicate-invoice warning, and Stripe Tax preflight warning. When `view === "form"`, everything renders exactly as today — zero changes to the form branch.

- [ ] **Step 3: Wire autosave**

```ts
const autosave = useInvoiceAutosave({
  invoiceStatus,
  clientId: form.clientId,
  currencyId: form.currencyId,
  preflightBlocked: stripeTaxPreflight?.ok === false,
  invoiceId: form.id,
  snapshot: JSON.stringify({ form, schedule }),
  doCreate: async () => {
    const inv = await createMutation.mutateAsync(buildInput());
    return { id: inv.id };
  },
  doUpdate: async () => {
    const inv = await updateMutation.mutateAsync({ id: form.id!, ...buildInput() });
    return { id: inv.id };
  },
  onCreated: (id) => {
    setForm((f) => ({ ...f, id }));
    window.history.replaceState(null, "", `/invoices/${id}/edit`);
  },
});
```

Autosave runs regardless of view (both views share state; a DRAFT should never be lost either way). Guard interplay with the explicit buttons: in `handleSave`, keep `savingRef` as-is — additionally, `useInvoiceAutosave`'s in-flight save and the button save can race only in `edit` mode where both call `update` with full payloads (last write wins, both server-validated); accept this in v1 and note it in the PR.

Status chip next to the toggle:

```tsx
<span aria-live="polite" className="text-xs text-muted-foreground">
  {autosave.status === "saving" && "Saving…"}
  {autosave.status === "pending" && "Unsaved changes"}
  {autosave.status === "saved" && "Saved"}
  {autosave.status === "error" && (
    <button type="button" onClick={autosave.retry} className="text-destructive underline">
      Save failed — retry
    </button>
  )}
</span>
```

Button changes: when `invoiceStatus === "DRAFT"`, hide the "Save as Draft" button in canvas view only (autosave covers it; form view keeps it until form retirement). "Save & Send" unchanged in both views. When `invoiceStatus === "SENT"`, both buttons render in both views and autosave is inert (gated in `canAutosave`).

- [ ] **Step 4: Update the two pages**

`new/page.tsx`: extend the org fetch's selection with the template/branding fields listed in Interfaces, compute `const templateConfig = getInvoiceTemplateConfig(org);`, pass `invoiceStatus="DRAFT"`, `templateConfig`, `orgDisplay={{ name: org.name, logoUrl: org.logoUrl }}`.
`[id]/edit/page.tsx`: same org extension; pass `invoiceStatus={invoice.status === "SENT" ? "SENT" : "DRAFT"}` plus the same two props.

- [ ] **Step 5: Typecheck, full test suite, commit**

Run: `npx tsc --noEmit` → clean. Run: `npm run test:run` → all suites pass.

```bash
git add src/components/invoices/InvoiceForm.tsx "src/app/(dashboard)/invoices/new/page.tsx" "src/app/(dashboard)/invoices/[id]/edit/page.tsx"
git commit -m "Add Form/Canvas editor toggle with DRAFT autosave and side rail"
```

**Dependencies:** Tasks 4, 7 (and transitively 2, 3, 5, 6)
**Estimated scope:** L

---

### Task 9: Playwright probe-page verification

**REQUIRED SUB-SKILL:** `lwd-ui-probe-page-visual-verification` — read it first; it owns the `PUBLIC_PATHS` allowlist in `src/proxy.ts` and the throwaway probe-page pattern for auth-gated `(dashboard)` UI.

**Files:**
- Create (throwaway, deleted before merge): a probe route per that skill's pattern rendering `InvoiceCanvas` with fixture data (client "Acme Co", 2 standard lines, 1 line with 10% discount + one tax, invoice-level fixed discount, each of the four `templateConfig.template` values via a query param).

- [ ] **Step 1: Build the probe page and add its path to `PUBLIC_PATHS`** exactly as the skill prescribes.
- [ ] **Step 2: Screenshot all four template themes** (`?template=modern|classic|minimal|compact`) at desktop and 390px mobile widths; confirm: banded/ruled/plain headers render per theme, accent + font vars apply, totals block matches the fixture math from `calculateInvoiceTotalsWithDiscount`.
- [ ] **Step 3: Interaction pass** (Playwright): click a line name → input appears pre-filled → type → blur → text updates and the Amount cell + totals change; Escape reverts; Enter on last row's name appends a row; drag-reorder works; discount popover opens from the totals block.
- [ ] **Step 4: Remove the probe route and its `PUBLIC_PATHS` entry; verify with `git status` that only intended files remain.** Commit any fixes the pass surfaced:

```bash
git add -A src/components/invoices/canvas src/proxy.ts
git commit -m "Canvas fixes from Playwright visual verification pass"
```

**Dependencies:** Tasks 7, 8
**Estimated scope:** M

---

## Verification ceiling (sandbox)

What `npx tsc --noEmit` + vitest prove: the pure modules (theme mapping, autosave gating/scheduling, line-item utils, schema relaxation, send guard) behave as specified against mocks; the codebase compiles coherently.

What they CANNOT prove (a human must verify against a real DB + browser before calling this done):

1. **Autosave end-to-end against a real database** — create-on-first-edit actually persists and the URL rewrite leaves the page functional; rapid edits under the delete-and-recreate lines write path don't lose rows; the DRAFT-with-empty-names write survives `resolveInvoiceTax` (legacy and Stripe Tax orgs both).
2. **`npm run build`** — not runnable in the sandbox (shells out to `prisma migrate deploy`); must pass in CI/Netlify.
3. **Canvas rendering in the real authenticated app** — Task 9's probe page covers the component in isolation; the integrated editor (toggle, side rail, status chip) needs a logged-in click-through on staging: create → type → wait 2s → reload → data persisted; edit a SENT invoice → confirm NO autosave fires and explicit save still works; send an invoice with an unnamed line → confirm the BAD_REQUEST message surfaces as a toast.
4. **Scheduled-sends cron behavior** with an unnamed-lines draft that was scheduled — verify the row fails gracefully without aborting the batch.
