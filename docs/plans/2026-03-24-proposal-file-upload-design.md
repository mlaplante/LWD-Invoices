# Proposal File Upload Design

**Date**: 2026-03-24
**Status**: Approved

## Overview

Allow users to upload an external PDF/DOCX as a proposal for an estimate, as an alternative to the built-in markdown proposal editor. The two modes are mutually exclusive per estimate.

## Decisions

- **Mutually exclusive**: Either built-in editor OR uploaded file, not both
- **Portal delivery**: Direct download link (no inline viewer)
- **Storage**: Supabase Storage (private bucket with signed URLs)
- **Schema approach**: Add fields to existing ProposalContent model (not a separate model)

## Data Model

Add two nullable fields to `ProposalContent`:

```prisma
model ProposalContent {
  // ... existing fields ...
  fileUrl      String?   // Supabase Storage URL for uploaded proposal
  fileName     String?   // Original filename (e.g., "proposal-v2.pdf")
}
```

Mode detection: `fileUrl` set = external file mode. `fileUrl` null + `sections` has content = editor mode.

## File Upload Flow

**Supabase Storage:**
- Bucket: `proposals` (private, signed URLs for access)
- Path: `{organizationId}/{invoiceId}/{filename}`
- Accepted types: `.pdf`, `.docx`
- Max size: 10MB

**API route: `POST /api/proposals/upload`**
1. Accepts FormData with `file` and `invoiceId`
2. Validates: authenticated, invoice belongs to org, invoice is ESTIMATE type
3. Uploads to Supabase Storage
4. Creates/updates ProposalContent — sets `fileUrl` and `fileName`, clears `sections` to `[]`
5. Returns proposal content record

**Deletion**: Existing proposal delete also removes file from Supabase Storage.

## UI Changes (Invoice Detail Page)

Three states for the proposal section:

1. **No proposal** — Two options side by side:
   - "Generate from Template" (existing)
   - "Upload Proposal Document" (new — file picker for PDF/DOCX)

2. **Built-in proposal** (`fileUrl` null) — Existing ProposalEditor, plus "Switch to uploaded file" option with warning

3. **Uploaded file** (`fileUrl` set) — Show:
   - File name with icon
   - Download, Replace, Remove buttons
   - "Switch to template editor" option with warning

## Portal Changes

- If `fileUrl` set → serve signed Supabase Storage URL (1hr expiry)
- If `fileUrl` null → generate PDF from sections (existing behavior)
- Button label: "Download Proposal" (uploaded) vs "View Full Proposal" (generated)

## Files Affected

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `fileUrl`, `fileName` to ProposalContent |
| `src/app/api/proposals/upload/route.ts` | **New** — FormData upload endpoint |
| `src/components/invoices/ProposalFileUpload.tsx` | **New** — Upload UI component |
| `src/app/(dashboard)/invoices/[id]/page.tsx` | Conditional rendering for 3 proposal states |
| `src/server/routers/proposals.ts` | Update delete to clean up Storage file |
| `src/app/api/portal/[token]/proposal-pdf/route.ts` | Check fileUrl → signed URL redirect |
| `src/app/portal/[token]/page.tsx` | Conditional button label |
| `src/lib/supabase/storage.ts` | **New** — Storage helper (if needed) |

## What Does NOT Change

ProposalEditor, ProposalTemplateForm, MarkdownPreview, proposal-pdf generation, template system, estimate-to-invoice conversion.
