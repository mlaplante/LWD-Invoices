# WYSIWYG Invoice Canvas (Live-Edit Invoice Editor)

**Date**: 2026-08-01
**Status**: Approved (design)

---

## Summary

Add a FreshBooks-style live-editing surface for invoices: instead of filling a
form and only seeing the rendered invoice after saving, the user edits directly
on a paper-styled HTML rendition of the invoice ("the canvas"). Every field
renders as static text until clicked/tabbed into, then swaps to an
identically-styled input. This was the single most-praised competitor UX in the
2026-08 competitive analysis (`docs/competitive-gap-analysis-2026-08.md`).

Decisions already confirmed with the user:

1. **Rollout**: ship as a **Form | Canvas view toggle** inside the existing
   editor, sharing the same state; retire the form view later once proven.
2. **Fidelity**: **one canvas, template-themed** — a single HTML layout that
   adapts font/accent/density from the org's chosen PDF template config; not
   four pixel-faithful HTML twins of the react-pdf templates.
3. **Type scope**: all five `InvoiceType`s (DETAILED, SIMPLE, ESTIMATE,
   CREDIT_NOTE, DEPOSIT) in v1.
4. **Save model**: **autosave from day one** for DRAFT invoices (create-on-first-
   meaningful-edit, debounced updates); SENT invoices keep explicit save.

## Context — what already exists

Verified by reading the code this session (via a scoped exploration pass over
the files below):

| Capability | Where | Relevance |
|---|---|---|
| Invoice editor (pure form, no preview) | `src/components/invoices/InvoiceForm.tsx` (884 lines; `handleSave` at ~line 393) | Owns `InvoiceFormData` state via plain `useState`; the canvas becomes a second controlled view over this same state |
| Line-item table with memoized rows + dnd-kit reorder | `src/components/invoices/LineItemEditor.tsx` (704 lines; `SortableLineItemImpl`) | The performance pattern (React.memo rows, ref-stabilized callbacks) to reuse for canvas line rows |
| Metadata grid (client/type/dates/currency/number) | `src/components/invoices/InvoiceMetadata.tsx` (137 lines) | Fields the canvas re-presents as inline-editable header/Bill-To/dates regions |
| Keyboard helpers (Enter=new row, ⌘D duplicate) | `src/components/invoices/line-item-keyboard.ts` | Reuse unchanged in canvas rows |
| Client-side totals math | `calculateInvoiceTotalsWithDiscount` / `calculateLineTotals` (`src/lib/tax-calculator.ts`, imported by the form) | Canvas totals block calls the same functions; the canvas never does its own money math |
| Create/update mutations | `src/server/routers/invoices.ts` (1,729 lines; `create` ~line 427, `update` ~line 693, `invoiceWriteSchema` ~line 62, `lineSchema` ~line 47) | `update` already accepts `invoiceWriteWithScheduleSchema.partial()` — autosave can use it as-is; totals/tax recomputed server-side on every write |
| PDF templates (react-pdf only, 4 variants) | `src/server/services/pdf-templates/{classic,modern,compact,minimal}.tsx`, `types.ts`, `index.ts` | Cannot render in the DOM; source of the visual language the canvas approximates |
| Template config resolution | `src/server/services/invoice-template-config.ts` (`getInvoiceTemplateConfig`: template, font, accent color, show-logo, footer text) | Input to the canvas theme mapping |
| Portal invoice HTML view (3rd independent rendering) | `src/app/portal/[token]/page.tsx` (551 lines; duplicated totals/tax display logic) | Future consumer of the canvas in `readOnly` mode (out of scope for v1, but the canvas API keeps the door open) |
| AI Draft QA panel, payment schedule, reminder overrides | `InvoiceDraftQA.tsx`, `PaymentScheduleSection.tsx`, inline blocks in `InvoiceForm.tsx` (~lines 602–684 for invoice-level discount) | Non-paper controls that move to a side rail in canvas view |
| Edit-page status gate | `src/app/(dashboard)/invoices/[id]/edit/page.tsx` (only DRAFT and SENT are editable) | Basis for the DRAFT-only autosave rule |

Notable absences (also verified): no form library (no react-hook-form/zustand),
no autosave/debounce anywhere in the invoice UI, no `contentEditable` or
inline-edit pattern anywhere in `src/`, no rich-text editor dependency in
`package.json`.

## Architecture

**UI — new `src/components/invoices/canvas/` family** (all client components):

- `InvoiceCanvas.tsx` — the paper sheet: org logo/name, document-type header
  label (INVOICE / ESTIMATE / CREDIT NOTE), Bill To block, invoice number +
  dates row, line-item table, totals block, notes, footer text. Props:
  `{ value: InvoiceFormData; onChange; readOnly?: boolean; clients; currencies;
  taxes; org; theme }`. It is a controlled component; no internal copy of the
  invoice data.
- Editable primitives — `EditableText`, `EditableMoney`, `EditableDate`, and an
  inline-select wrapper (client, currency, line type, tax toggles). Render as
  text (with a subtle hover affordance) until focus/click; then swap to an
  identically-styled shadcn `Input`/`Select`/`Popover`. Commit on blur/Enter,
  cancel on Escape. Fully keyboard-tabbable in document order.
- `CanvasLineRows.tsx` — the invoice table rows, reusing `LineItemEditor`'s
  memoized-row + `@dnd-kit/sortable` pattern and `line-item-keyboard.ts`.
  Hover reveals drag handle, delete, and description toggle; a trailing
  "+ Add line" row appends.
- Totals block — subtotal / per-line and invoice-level discount / tax / total,
  computed by the existing `calculateInvoiceTotalsWithDiscount`. The
  invoice-level discount is editable inline within the totals block
  (FreshBooks pattern), replacing the form's separate discount section in
  canvas view.
- Side rail — collapsible panel beside the canvas hosting the non-paper
  controls: payment schedule, reminder overrides, Draft QA, AI
  draft-from-prompt (create mode), project link, exchange rate. These reuse
  the existing components unchanged.
- Theme — `src/components/invoices/canvas/canvas-theme.ts`: a client-safe pure
  mapping from `{ template, fontFamily, accentColor, showLogo, footerText }`
  (the same fields `getInvoiceTemplateConfig` resolves) to CSS variables
  (font stack, accent, spacing density, header treatment). The server page
  passes the resolved config down; no server-only imports in the client
  bundle.

**View toggle** — `InvoiceForm.tsx` gains a `Form | Canvas` segmented toggle.
Both views render from the same lifted `InvoiceFormData`; switching mid-edit
loses nothing. Preference persists per user in `localStorage`
(`invoice-editor-view`). v1 defaults to Form; flipping the default to Canvas
is part of the later form-retirement change, not this one.

**Autosave — new hook `src/components/invoices/useInvoiceAutosave.ts`:**

- Debounce ~2s after the last change; single-flight (while a save is in
  flight, keep only the latest snapshot queued; drop intermediates). Reuses
  the existing `savingRef` double-submit guard pattern.
- Create mode: the first *meaningful* change (a `clientId` selected, or any
  line with a non-empty name/rate) fires `invoices.create` with DRAFT status,
  then `router.replace` to `/invoices/[id]/edit` and continues as edit mode.
  Opening the page and typing nothing meaningful never creates a record.
- Edit mode: debounced `invoices.update` with the full current write payload
  (the procedure already recomputes totals/tax server-side; lines are
  replace-on-write today, which autosave inherits unchanged).
- **DRAFT-only**: autosave is disabled when `status === "SENT"` — SENT
  invoices are live in the client portal, so edits there keep the explicit
  Save button. Status chip in the editor header shows `Saving… / Saved · just
  now / Unsaved changes — retry`.
- "Save & Send" remains the primary CTA in both views. "Save as Draft"
  disappears in canvas view for DRAFT invoices (autosave covers it) and
  remains in form view until the form retires.

**Router — one validation change** (`src/server/routers/invoices.ts`): relax
`lineSchema.name` to permit empty strings **when the target invoice is in
DRAFT status** — determined server-side (`create` always writes DRAFT; `update`
checks the stored invoice's status), never from client-supplied input. Send-time
(and any non-DRAFT write) enforces non-empty names exactly as today. Org-scoping and role gates on `create`/`update` are
untouched (see lwd-architecture-contract; both are already `OWNER`/`ADMIN`
gated and org-scoped).

**Error handling** — autosave failure is non-blocking: toast + persistent
"Unsaved changes — retry" chip; local state stays authoritative; retry on next
change or manual chip click. Client-side zod validation runs before every
autosave payload; Send keeps its full current validation path.

## Data Layer / Schema changes

None anticipated — no Prisma schema changes. The only server-side change is the
DRAFT-conditional relaxation of `lineSchema.name` described above.

## Testing

- **Pure/unit** (mirror existing vitest style in `src/test/`):
  `canvas-theme.ts` mapping; editable primitives (commit on blur/Enter, revert
  on Escape); `useInvoiceAutosave` with fake timers — debounce window,
  single-flight queueing, create→update transition, DRAFT-only gate, retry
  path.
- **Router**: integration-style tests for the DRAFT-conditional line-name
  relaxation — empty-name line accepted on DRAFT write, rejected on SENT write
  and on send; plus an org-scoping assertion on `update` per
  lwd-validation-and-qa.
- **Visual/interaction**: Playwright pass using the probe-page pattern
  (lwd-ui-probe-page-visual-verification) since `(dashboard)` routes are
  auth-gated — type on the canvas, totals update live, autosave chip cycles
  through its states.
- **Verification ceiling**: autosave-against-real-DB behavior (create-on-first-
  edit, replace-on-write lines under rapid edits) cannot be proven in the
  sandbox — a human must exercise it against a real database before "done"
  (see the implementation plan's Verification ceiling section).

## Out of scope

- **Portal adoption of the canvas** — `readOnly` mode is designed for it, but
  replacing `src/app/portal/[token]/page.tsx`'s hand-written view (and its
  duplicated totals logic) is a follow-up.
- **Autosave for SENT invoices** — deliberate product decision, not a deferral.
- **Retiring the form view** — happens in a later change once the canvas has
  been used in anger.
- **Pixel-faithful HTML twins of the four PDF templates** — rejected during
  design (triples the surface to keep in sync).
- **Rich-text/contentEditable editing** — rejected; invoices are structured
  data and money math stays in `tax-calculator.ts` / server recomputation.
- **New autosave infrastructure elsewhere in the app** — the hook is
  invoice-editor-local; generalizing it is a follow-up if wanted.
