# Proposal Templates Design

**Date:** 2026-03-24
**Status:** Approved
**Approach:** Proposal layer on top of existing Estimates (Approach 3)

## Overview

Add proposal template support to Pancake so that ESTIMATE-type invoices can optionally generate a full multi-page proposal PDF instead of just a basic estimate sheet. Based on the LaPlante Project Proposal DOCX template.

### Key decisions

- Proposals are an optional enhancement layer on existing estimates — estimates work exactly as before if no proposal is attached
- PDF uses existing Pancake styling (brandColor, logo, fonts) extended with proposal sections
- Reusable content blocks managed via named templates with org-level defaults
- Content stored as markdown with variable substitution (`{{client_name}}`, etc.)

## Data Model

### ProposalTemplate

Named, reusable templates (e.g., "Web Redesign", "SEO Project").

| Field            | Type     | Notes                                      |
|------------------|----------|--------------------------------------------|
| id               | String   | cuid                                       |
| name             | String   | e.g., "Web Redesign Proposal"              |
| organizationId   | String   | FK → Organization                          |
| sections         | Json     | Array of section objects (see below)        |
| isDefault        | Boolean  | One template per org can be default         |
| createdAt        | DateTime |                                            |
| updatedAt        | DateTime |                                            |

### ProposalContent

The actual proposal attached to a specific estimate.

| Field            | Type     | Notes                                      |
|------------------|----------|--------------------------------------------|
| id               | String   | cuid                                       |
| invoiceId        | String   | Unique FK → Invoice (ESTIMATE type only)    |
| organizationId   | String   | FK → Organization                          |
| templateId       | String?  | FK → ProposalTemplate (which template it was based on) |
| sections         | Json     | Array of section objects with filled-in content |
| version          | String   | Default "1.0"                              |
| createdAt        | DateTime |                                            |
| updatedAt        | DateTime |                                            |

### Section JSON structure

```json
[
  { "key": "executive_summary", "title": "Executive Summary", "content": "..." },
  { "key": "developer_profile", "title": "Developer Profile", "content": "..." },
  { "key": "technologies", "title": "Technologies & Approach", "content": "..." },
  { "key": "budget", "title": "Budget", "content": null },
  { "key": "production_process", "title": "Production Process", "content": "..." },
  { "key": "assumptions", "title": "Details and Assumptions", "content": "..." },
  { "key": "terms", "title": "Terms of Agreement", "content": "..." }
]
```

The `budget` section has `content: null` — it is always auto-generated from the estimate's line items.

## UI Flow

### Template Management (Settings → Proposal Templates)

- List of named templates with create/edit/delete
- Each template has a form with 7 section fields (markdown textareas)
- One template can be marked as "Default"
- First template seeded from DOCX content on migration

### Creating a Proposal (from an existing Estimate)

- "Generate Proposal" button on estimate detail page
- Modal/page flow:
  1. Pick a template (or start from default)
  2. Sections auto-populate from template
  3. Client name, budget line items, dates auto-fill from estimate
  4. Edit any section inline before saving
- Saves a `ProposalContent` record linked to the estimate

### Editing a Proposal

- Proposal shows as a tab/section on estimate detail page
- Edit any section, re-save
- "Download Proposal PDF" button generates the proposal-style PDF
- Existing "Download PDF" still generates the simple estimate sheet

### Portal Experience

- Client views estimate with proposal → "View Proposal" link/button
- Renders proposal PDF or web view
- Accept/Reject buttons work as they do now for estimates

## PDF Generation

New file: `src/server/services/proposal-pdf.tsx`

Extends existing Pancake PDF style (`@react-pdf/renderer`). Reuses design tokens (Helvetica fonts, brandColor, logo) and shared helpers (`formatAmount`, `formatDate`).

### Page structure

1. **Cover Page** — Org logo, org name, "PROJECT PROPOSAL" (in brandColor), client name, version, date
2. **Table of Contents** — Auto-generated from section titles
3. **Executive Summary** — Overview, Goals, Key Highlights, Current State Assessment
4. **Developer Profile** — From template/proposal content
5. **Technologies & Approach** — From template/proposal content
6. **Budget** — Auto-generated from estimate line items (reuse invoice table/totals rendering)
7. **Production Process** — Discovery → Design & Strategy → Development & Implementation → Delivery
8. **Details and Assumptions** — Bullet list from content
9. **Terms of Agreement** — From template content with client name auto-substituted

### Content rendering

Markdown content → react-pdf elements. Simple renderer handles: headings (h2, h3), paragraphs, bold, italic, bullet lists. No full markdown spec needed.

### Variable substitution

Content supports placeholders replaced at render time:
- `{{client_name}}` — from estimate's client
- `{{client_url}}` — from client data
- `{{project_type}}` — manual field on proposal
- `{{date}}` — estimate date

## API / tRPC Layer

### New router: `proposalTemplates`

| Procedure                     | Description                                      |
|-------------------------------|--------------------------------------------------|
| `proposalTemplates.list`      | List all templates for the org                   |
| `proposalTemplates.get`       | Get a single template by ID                      |
| `proposalTemplates.create`    | Create new template (name + sections JSON)        |
| `proposalTemplates.update`    | Update template name/sections/isDefault           |
| `proposalTemplates.delete`    | Delete a template                                |

### New router: `proposals`

| Procedure          | Description                                                    |
|--------------------|----------------------------------------------------------------|
| `proposals.create` | Create proposal for an estimate (invoiceId, templateId, overrides) |
| `proposals.get`    | Get proposal by invoiceId                                       |
| `proposals.update` | Update proposal sections                                        |
| `proposals.delete` | Remove proposal from an estimate                                |

### Existing changes

- `invoices.get` — Include `proposalContent` in response for ESTIMATE-type invoices
- New route: `GET /api/portal/[token]/proposal-pdf`
- New route: `GET /api/invoices/[id]/proposal-pdf`

### Seed data

Migration script creates first `ProposalTemplate` populated with DOCX template content:
- Developer Profile (security-first, strategic approach, notable clients)
- Technologies & Approach (platform, dev tools, analytics boilerplate)
- Production Process (discovery, design, development, delivery phases)
- Details and Assumptions (standard assumptions)
- Terms of Agreement (standard terms, disclaimer, copyright)
