# Proposal File Upload Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to upload an external PDF/DOCX as a proposal for an estimate, as an alternative to the built-in markdown editor.

**Architecture:** Add `fileUrl`/`fileName` fields to `ProposalContent`. Upload files to a private Supabase Storage bucket (`proposals`). The UI shows three states: no proposal, built-in editor, or uploaded file. Portal serves signed URLs for uploaded files instead of generating PDFs.

**Tech Stack:** Next.js App Router, Prisma, Supabase Storage, tRPC, React, shadcn/ui, Tailwind

**Design doc:** `docs/plans/2026-03-24-proposal-file-upload-design.md`

---

### Task 1: Add fileUrl/fileName to ProposalContent schema

**Files:**
- Modify: `prisma/schema.prisma:785-797`

**Step 1: Add fields to ProposalContent model**

In `prisma/schema.prisma`, update the `ProposalContent` model to add two nullable fields after `sections`:

```prisma
model ProposalContent {
  id              String   @id @default(cuid())
  invoiceId       String   @unique
  invoice         Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  templateId      String?
  template        ProposalTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  sections        Json     // Array of { key, title, content } objects
  fileUrl         String?  // Supabase Storage path for uploaded proposal file
  fileName        String?  // Original filename (e.g., "proposal-v2.pdf")
  version         String   @default("1.0")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**Step 2: Create and run migration**

```bash
cd /Users/mlaplante/Sites/pancake
npx prisma migrate dev --name add-proposal-file-fields
```

Expected: Migration creates `ALTER TABLE "ProposalContent" ADD COLUMN "fileUrl" TEXT, ADD COLUMN "fileName" TEXT`

**Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

**Step 4: Verify build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add prisma/
git commit -m "feat: add fileUrl and fileName fields to ProposalContent"
```

---

### Task 2: Create Supabase Storage helper

**Files:**
- Create: `src/lib/supabase/storage.ts`

**Step 1: Create the storage helper module**

Create `src/lib/supabase/storage.ts`:

```typescript
import { createAdminClient } from "./admin";

const BUCKET = "proposals";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function uploadProposalFile(
  orgId: string,
  invoiceId: string,
  file: File
): Promise<{ path: string; fileName: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Only PDF and DOCX files are allowed");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File must be under 10MB");
  }

  const supabase = createAdminClient();
  const ext = file.name.split(".").pop();
  const storagePath = `${orgId}/${invoiceId}/proposal.${ext}`;

  // Remove existing file if any (replace scenario)
  await supabase.storage.from(BUCKET).remove([storagePath]);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: true,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  return { path: storagePath, fileName: file.name };
}

export async function deleteProposalFile(path: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error("Failed to delete proposal file:", error.message);
}

export async function getProposalFileSignedUrl(
  path: string,
  expiresIn = 3600
): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message}`);
  }
  return data.signedUrl;
}
```

**Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/lib/supabase/storage.ts
git commit -m "feat: add Supabase Storage helpers for proposal file upload"
```

---

### Task 3: Create upload API route

**Files:**
- Create: `src/app/api/proposals/upload/route.ts`

**Step 1: Create the upload API route**

Create `src/app/api/proposals/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { uploadProposalFile, deleteProposalFile } from "@/lib/supabase/storage";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const orgId = user?.app_metadata?.organizationId as string | undefined;
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const invoiceId = formData.get("invoiceId") as string | null;

  if (!file || !invoiceId) {
    return NextResponse.json(
      { error: "file and invoiceId are required" },
      { status: 400 }
    );
  }

  // Verify invoice is an ESTIMATE owned by this org
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId: orgId, type: "ESTIMATE" },
  });
  if (!invoice) {
    return NextResponse.json(
      { error: "Estimate not found" },
      { status: 404 }
    );
  }

  let path: string;
  let fileName: string;
  try {
    const result = await uploadProposalFile(orgId, invoiceId, file);
    path = result.path;
    fileName = result.fileName;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 }
    );
  }

  // Upsert ProposalContent: create if not exists, update if exists
  const existing = await db.proposalContent.findFirst({
    where: { invoiceId, organizationId: orgId },
  });

  let proposal;
  if (existing) {
    // If switching from editor mode, clean up old file if different path
    if (existing.fileUrl && existing.fileUrl !== path) {
      await deleteProposalFile(existing.fileUrl);
    }
    proposal = await db.proposalContent.update({
      where: { id: existing.id },
      data: {
        fileUrl: path,
        fileName,
        sections: [],  // Clear editor sections
        templateId: null,
      },
    });
  } else {
    proposal = await db.proposalContent.create({
      data: {
        invoiceId,
        organizationId: orgId,
        fileUrl: path,
        fileName,
        sections: [],
      },
    });
  }

  return NextResponse.json(proposal);
}
```

**Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/api/proposals/upload/route.ts
git commit -m "feat: add proposal file upload API route"
```

---

### Task 4: Update proposals router delete to clean up storage

**Files:**
- Modify: `src/server/routers/proposals.ts:119-130`

**Step 1: Update the delete procedure**

In `src/server/routers/proposals.ts`, update the `delete` mutation to also remove the file from Supabase Storage if one exists:

```typescript
// Add import at top of file (line 1-4 area):
import { deleteProposalFile } from "@/lib/supabase/storage";

// Replace the delete procedure (lines 119-130):
  delete: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.proposalContent.findFirst({
        where: { invoiceId: input.invoiceId, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // Clean up uploaded file from storage if present
      if (existing.fileUrl) {
        await deleteProposalFile(existing.fileUrl);
      }

      await ctx.db.proposalContent.delete({ where: { id: existing.id } });
      return { success: true };
    }),
```

**Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/server/routers/proposals.ts
git commit -m "feat: clean up Supabase Storage file on proposal delete"
```

---

### Task 5: Create ProposalFileUpload component

**Files:**
- Create: `src/components/invoices/ProposalFileUpload.tsx`

**Step 1: Create the upload UI component**

Create `src/components/invoices/ProposalFileUpload.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, FileText, File, X, RefreshCw } from "lucide-react";

interface ProposalFileUploadProps {
  invoiceId: string;
  fileUrl: string | null;
  fileName: string | null;
  onUploaded: () => void;
  onRemoved: () => void;
}

export function ProposalFileUpload({
  invoiceId,
  fileUrl,
  fileName,
  onUploaded,
  onRemoved,
}: ProposalFileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deleteMutation = trpc.proposals.delete.useMutation({
    onSuccess: () => {
      toast.success("Proposal file removed");
      onRemoved();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.type)) {
      toast.error("Only PDF and DOCX files are allowed");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("invoiceId", invoiceId);

      const res = await fetch("/api/proposals/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      toast.success("Proposal uploaded");
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isPdf = fileName?.toLowerCase().endsWith(".pdf");
  const FileIcon = isPdf ? FileText : File;

  // ── Uploaded file display ──
  if (fileUrl && fileName) {
    return (
      <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{fileName}</p>
              <p className="text-xs text-muted-foreground">
                Uploaded proposal document
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm("Remove this proposal file?")) {
                  deleteMutation.mutate({ invoiceId });
                }
              }}
              disabled={deleteMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Remove
            </Button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    );
  }

  // ── Upload button (no file yet) ──
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        <Upload className="mr-2 h-4 w-4" />
        {uploading ? "Uploading..." : "Upload Proposal Document"}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx"
        onChange={handleFileSelect}
        className="hidden"
      />
    </>
  );
}
```

**Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/components/invoices/ProposalFileUpload.tsx
git commit -m "feat: add ProposalFileUpload component"
```

---

### Task 6: Update invoice detail page for three proposal states

**Files:**
- Modify: `src/app/(dashboard)/invoices/[id]/page.tsx:329-335`
- Modify: `src/components/invoices/GenerateProposalButton.tsx`

**Step 1: Update GenerateProposalButton to expose proposal data**

The `GenerateProposalButton` currently hides itself when a proposal exists (line 40: `if (existingProposal) return null`). We need to refactor the proposal section so the parent page manages the three states.

Replace the proposal section in `src/app/(dashboard)/invoices/[id]/page.tsx` (lines 329-335). First, the page needs to be aware of proposal state. Since this is a server component, we need a **client wrapper** for the proposal section.

Create a new wrapper: modify `src/components/invoices/ProposalSection.tsx`:

```tsx
"use client";

import { trpc } from "@/trpc/client";
import { GenerateProposalButton } from "./GenerateProposalButton";
import { ProposalEditor } from "./ProposalEditor";
import { ProposalFileUpload } from "./ProposalFileUpload";

export function ProposalSection({ invoiceId }: { invoiceId: string }) {
  const utils = trpc.useUtils();
  const { data: proposal, isLoading } = trpc.proposals.get.useQuery({ invoiceId });

  const invalidate = () => utils.proposals.get.invalidate({ invoiceId });

  if (isLoading) return null;

  // State 1: No proposal — show both options
  if (!proposal) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <GenerateProposalButton invoiceId={invoiceId} />
          <span className="text-xs text-muted-foreground">or</span>
          <ProposalFileUpload
            invoiceId={invoiceId}
            fileUrl={null}
            fileName={null}
            onUploaded={invalidate}
            onRemoved={invalidate}
          />
        </div>
      </div>
    );
  }

  // State 2: Uploaded file
  if (proposal.fileUrl) {
    return (
      <div className="space-y-4">
        <ProposalFileUpload
          invoiceId={invoiceId}
          fileUrl={proposal.fileUrl}
          fileName={proposal.fileName}
          onUploaded={invalidate}
          onRemoved={invalidate}
        />
      </div>
    );
  }

  // State 3: Built-in editor
  return (
    <div className="space-y-4">
      <ProposalEditor invoiceId={invoiceId} />
    </div>
  );
}
```

**Step 2: Update the invoice detail page**

In `src/app/(dashboard)/invoices/[id]/page.tsx`, replace lines 329-335:

Old:
```tsx
      {/* ── Proposal (Estimates only) ──────────────────────────── */}
      {invoice.type === "ESTIMATE" && (
        <div className="space-y-4">
          <GenerateProposalButton invoiceId={invoice.id} />
          <ProposalEditor invoiceId={invoice.id} />
        </div>
      )}
```

New:
```tsx
      {/* ── Proposal (Estimates only) ──────────────────────────── */}
      {invoice.type === "ESTIMATE" && (
        <ProposalSection invoiceId={invoice.id} />
      )}
```

Update imports: remove `GenerateProposalButton` and `ProposalEditor` imports (if not used elsewhere on the page), add `ProposalSection`:
```typescript
import { ProposalSection } from "@/components/invoices/ProposalSection";
```

**Step 3: Update proposals.get to include fileUrl/fileName**

The `proposals.get` procedure already returns the full record, so `fileUrl` and `fileName` will be included automatically after the schema migration. No router change needed.

**Step 4: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/components/invoices/ProposalSection.tsx src/app/\(dashboard\)/invoices/\[id\]/page.tsx
git commit -m "feat: add three-state proposal section with upload support"
```

---

### Task 7: Update portal PDF route to serve uploaded files

**Files:**
- Modify: `src/app/api/portal/[token]/proposal-pdf/route.ts`
- Modify: `src/app/api/invoices/[id]/proposal-pdf/route.ts`

**Step 1: Update portal PDF route**

In `src/app/api/portal/[token]/proposal-pdf/route.ts`, after fetching the proposal (line 29-35), add a check for `fileUrl` before the PDF generation logic:

```typescript
// Add import at top:
import { getProposalFileSignedUrl } from "@/lib/supabase/storage";

// After line 35 (`if (!proposal) { ... }`), add:
  // If an uploaded file exists, redirect to signed URL
  if (proposal.fileUrl) {
    const signedUrl = await getProposalFileSignedUrl(proposal.fileUrl);
    return Response.redirect(signedUrl, 302);
  }

  // Otherwise, generate PDF from sections (existing code continues)
```

**Step 2: Update admin PDF route**

In `src/app/api/invoices/[id]/proposal-pdf/route.ts`, after fetching the proposal (line 37-43), add the same check:

```typescript
// Add import at top:
import { getProposalFileSignedUrl } from "@/lib/supabase/storage";

// After line 43 (`if (!proposal) { ... }`), add:
  // If an uploaded file exists, redirect to signed URL
  if (proposal.fileUrl) {
    const signedUrl = await getProposalFileSignedUrl(proposal.fileUrl);
    return Response.redirect(signedUrl, 302);
  }

  // Otherwise, generate PDF from sections (existing code continues)
```

**Step 3: Update portal page button label**

In `src/app/portal/[token]/page.tsx`, update the proposal query to include `fileUrl` (line 61) and conditionally change the label (lines 238-247):

Change the select at line 61:
```typescript
proposalContent: { select: { id: true, fileUrl: true } },
```

Change the link at lines 238-247:
```tsx
            {invoice.proposalContent && (
              <a
                href={`/api/portal/${token}/proposal-pdf`}
                target="_blank"
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                {invoice.proposalContent.fileUrl ? (
                  <>
                    <Download className="h-4 w-4" />
                    Download Proposal
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    View Full Proposal
                  </>
                )}
              </a>
            )}
```

**Step 4: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/app/api/portal/\[token\]/proposal-pdf/route.ts src/app/api/invoices/\[id\]/proposal-pdf/route.ts src/app/portal/\[token\]/page.tsx
git commit -m "feat: serve uploaded proposal files from portal and admin PDF routes"
```

---

### Task 8: Create Supabase Storage bucket

**Files:** None (manual Supabase dashboard step)

**Step 1: Create the `proposals` bucket**

In the Supabase dashboard:
1. Go to Storage → New Bucket
2. Name: `proposals`
3. Public: **OFF** (private bucket)
4. File size limit: 10MB
5. Allowed MIME types: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

Alternatively, via SQL in the Supabase SQL editor:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proposals',
  'proposals',
  false,
  10485760,
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);
```

**Step 2: Verify** by checking Storage section in Supabase dashboard — `proposals` bucket should appear.

---

### Task 9: Final build verification and integration test

**Step 1: Run full build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

**Step 2: Run tests**

```bash
npm test
```

Expected: All existing tests pass.

**Step 3: Manual smoke test**

1. Navigate to an estimate in the dashboard
2. Verify "Generate Proposal" and "Upload Proposal Document" buttons appear side by side
3. Upload a PDF — verify it shows the file card with Replace/Remove buttons
4. Click Remove — verify it returns to the two-button state
5. Generate a template-based proposal — verify ProposalEditor appears (no upload UI)
6. Open the portal link — verify "Download Proposal" (for uploaded) or "View Full Proposal" (for generated) works

**Step 4: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "feat: complete proposal file upload feature"
```
