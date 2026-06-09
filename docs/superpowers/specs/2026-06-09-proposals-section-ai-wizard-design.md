# Proposals Section + AI Wizard — Design

**Date:** 2026-06-09
**Status:** Approved (pending spec review)

## Problem

Proposal machinery already exists end-to-end — AI generation (Gemini + `GEMINI_PROPOSAL_MODELS` fallback), a section editor, file upload, PDF, client-portal signing, and unsigned-proposal nudges. But there is **no front door**: no "Proposals" nav item and no list/index. Today the only way to reach a proposal is to open an `ESTIMATE` invoice's detail page. Estimates appear mixed into the "All Invoices" list with no dedicated home.

This project adds the front door: a nav section, a proposals-centric list, a creation wizard with AI drafting, and a thin proposal detail page. It does **not** change the underlying data model or the AI service.

## Mental Model

A "Proposal" **is** the existing `ESTIMATE`-type `Invoice` plus its 1:1 `ProposalContent`. No schema change. The estimate remains the source of truth for the proposal's dollar value (its line items). The user mostly never thinks of it as an "invoice" — the new surfaces present it as a proposal.

### Key existing constraint
`ProposalContent.invoiceId` is `@unique` — proposals are strictly 1:1 with an estimate. The portal token, PDF route (`/api/invoices/[id]/proposal-pdf`), email-event attribution, and nudges **all key off `invoiceId`**. Decoupling proposals from estimates is therefore explicitly **out of scope** — disproportionate and risky for a "surface a section" task.

The existing `proposals.generate` procedure requires an *existing* estimate (it reads `invoice.client.name`, the client's first project, and org items). The wizard's "create on save" flow therefore needs a sibling generate path keyed off `clientId` rather than an estimate id.

## Architecture

Reuse-first. The only net-new logic is entry points (nav, list, wizard, detail wrapper) and two thin server procedures. The AI service (`generateProposal`) is untouched.

### Navigation
- Add **Proposals** (icon: `FileText`) to `primaryNav` in `src/components/layout/SidebarNav.tsx`, immediately after Invoices.
- Mirror in `src/components/layout/MobileNav.tsx`.

### Routes

**`/proposals` — proposals-centric list** (server component)
- Backed by new `proposals.list` query.
- Columns tuned to the proposal lifecycle: client, title/number, **proposal status** (No draft / Draft / Sent / Viewed / Signed), value (invoice total), last activity.
- "New Proposal" button → `/proposals/new`.
- Empty state explains the feature and links to the wizard.
- Each row links to `/proposals/[id]`.

**`/proposals/new` — the wizard** (client component, `ProposalWizard`)
- **Step 1 — Setup:** Client (required), Project (optional, filtered to the chosen client), Template (optional; defaults to org default). Nothing persisted yet.
- **Step 2 — Draft:** "Generate with AI" → `proposals.generateDraft` mutation returns `{ sections, suggestedItems }` **without persisting**. Renders:
  - the shared **`ProposalSectionsEditor`** (extracted from `ProposalEditor`) for in-memory section editing, and
  - a **suggested line-items checklist**: item name + qty (editable) + real grounded rate, with accept/remove. Accepted items become the estimate's line items.
- When `GEMINI_API_KEY` is unset or output is invalid, `generateProposal` already returns `null`; the wizard proceeds with plain template sections and an empty item list.
- **Save:** `proposals.createFromWizard` creates the `ESTIMATE` invoice (accepted line items, via the existing invoice-creation path for numbering/tax) **and** the `ProposalContent` (sections) transactionally; returns `{ invoiceId }`. Redirect to `/proposals/[invoiceId]`.

**`/proposals/[id]` — thin detail wrapper** (server component; `id` = estimate invoice id)
- Proposal-flavored detail page; no invoice-payment chrome.
- Header: client name, proposal title/number, status badge, value, actions: Download PDF (`/api/invoices/[id]/proposal-pdf`), Send/share to portal (reuse the existing estimate send action), and an **"Open as estimate"** link to the full invoice detail page for invoice tooling.
- Body: existing **`ProposalSection`** (generate/upload/edit states) + existing **`ProposalEngagementPanel`** (viewed/signed timeline).
- Guard: 404 if the invoice is missing, not `type === "ESTIMATE"`, or not in the caller's org.

### Backend (tRPC, `src/server/routers/proposals.ts`)

- **`proposals.generateDraft`** — `requireRole("OWNER","ADMIN")`, input `{ clientId, projectId?, templateId? }`. (Decided during planning: **OWNER/ADMIN only**, matching `invoices.create`/`createFromWizard`, so an accountant can't generate a draft they'd then be unable to save. The existing invoice-page `generate` keeps its `ACCOUNTANT` role since it acts on an already-created estimate.) The existing `generate` body with client/project/items lookups keyed off `clientId` instead of an estimate. Refactor: extract the shared lookup+`generateProposal` body into a helper that both `generate` (invoiceId-based) and `generateDraft` (clientId-based) call. The AI service stays untouched. Returns `{ draft }`.
- **`proposals.createFromWizard`** — `requireRole("OWNER","ADMIN","ACCOUNTANT")`, input `{ clientId, projectId?, title?, sections, lineItems[], templateId? }`. Validates client (and project, if given) belong to the org. Creates the estimate + `ProposalContent` in one transaction, reusing the existing estimate-creation logic for invoice numbering and tax resolution. Returns `{ invoiceId }`.
- **`proposals.list`** — org-scoped `ESTIMATE` invoices enriched with proposal status, value, client, and last activity. Status derivation lives in a pure helper (`deriveProposalStatus`) for unit testing, deriving from `ProposalContent` existence, invoice `status`, and `EmailEvent`s — same signals `ProposalEngagementPanel` already uses.

### Refactor for reuse (targeted, in service of the goal)
Extract **`ProposalSectionsEditor`** from `src/components/invoices/ProposalEditor.tsx` (props: `sections`, `onChange`; preserves the read-only `budget` section handling and the markdown preview toggle). `ProposalEditor` keeps its persistence wiring (`proposals.get`/`update` by `invoiceId`) and renders the extracted editor internally — the invoice-page experience is unchanged, and the wizard reuses the identical editing UI on in-memory state.

## Data Flow

```
/proposals (list)  ──New Proposal──▶  /proposals/new (wizard)
                                          │ step 1: pick client/project/template (in memory)
                                          │ step 2: generateDraft (AI, not persisted)
                                          │         → sections + grounded item suggestions
                                          │ save: createFromWizard (estimate + content, txn)
                                          ▼
                                      /proposals/[invoiceId] (thin detail)
                                          → ProposalSection + ProposalEngagementPanel
                                          → "Open as estimate" → /invoices/[id]
```

## Error Handling & Edge Cases

- **AI unconfigured / invalid output** → wizard proceeds with template sections + empty item list (existing `generateProposal` null-fallback).
- **No client selected** → Generate and Save disabled.
- **No template and no org default** → surface "Create a template in Settings → Proposals first" with a link (matches current `generate` `BAD_REQUEST`).
- **Role gating** → identical to existing `generate` (`OWNER`/`ADMIN`/`ACCOUNTANT`).
- **Cross-org client/project in `createFromWizard`** → `NOT_FOUND`.
- **Detail wrapper for a non-estimate or foreign-org id** → 404.

## Testing

- `proposals.generateDraft` router test (mirrors `proposals-generate.router.test.ts`): client-based lookup, item grounding, role gating, null-fallback.
- `proposals.createFromWizard` test: transactional estimate + content creation; rejects cross-org client.
- `proposals.list` / `deriveProposalStatus` unit test: status derivation across the lifecycle.

## Out of Scope

- Decoupling proposals from the estimate-invoice model (portal token, PDF, email events, nudges all key off `invoiceId`).
- Changes to the AI service (`generateProposal`) itself.
- New proposal template editing (already exists at `/settings/proposals`).
