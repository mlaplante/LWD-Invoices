# Group C: Operational Automation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add receipt OCR, a KPI dashboard homepage, and recurring expense auto-creation to streamline daily operations.

**Architecture:** The app is a Next.js 16 monolith using tRPC v11 for server procedures, Prisma 7 with PostgreSQL for data, and Inngest for background cron jobs. The dashboard is a server component that aggregates data from existing tRPC callers. Receipt OCR introduces a new API route that calls the Anthropic Claude Vision API and returns structured data. Recurring expense generation already has a working Inngest cron + service function; we enhance it with notifications and audit logging.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui, tRPC v11, Prisma 7, Inngest 3.x, Supabase Auth + Storage, Vitest, recharts (new dependency for C2), @anthropic-ai/sdk (new dependency for C1)

---

## Task Order: C3 -> C1 -> C2

---

# C3: Recurring Expense Auto-Creation Enhancements

The recurring expense system already works (schema, Inngest cron at `src/inngest/functions/recurring-expenses.ts`, generator at `src/server/services/recurring-expense-generator.ts`). We need to add: (1) `lastRunDate` and `totalGenerated` fields, (2) notifications on generation, (3) audit log entries, and (4) UI badges on auto-generated expenses.

## C3-Step 1: Add lastRunDate and totalGenerated to schema

### Files
- **Modify:** `prisma/schema.prisma` (lines 652-687)
- **Create:** `prisma/migrations/<timestamp>_add_recurring_expense_tracking/migration.sql`

### Test (write first)
- **Create:** `src/test/recurring-expense-tracking.test.ts`

```typescript
// src/test/recurring-expense-tracking.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateExpensesForRecurring } from "@/server/services/recurring-expense-generator";

describe("Recurring Expense Generator - Tracking Fields", () => {
  let mockDb: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      expense: { create: vi.fn().mockResolvedValue({ id: "exp_1" }) },
      recurringExpense: { update: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      notification: { create: vi.fn().mockResolvedValue({}) },
    };
    mockDb = {
      $transaction: vi.fn(async (fn) => fn(mockTx)),
    };
  });

  it("sets lastRunDate when generating an expense", async () => {
    const now = new Date("2026-04-01T06:00:00Z");
    const rec = {
      id: "re_1",
      name: "Monthly SaaS",
      description: null,
      qty: 1,
      rate: { toNumber: () => 99.99 } as any,
      reimbursable: false,
      frequency: "MONTHLY" as const,
      interval: 1,
      startDate: new Date("2026-03-01"),
      nextRunAt: new Date("2026-04-01"),
      endDate: null,
      maxOccurrences: null,
      occurrenceCount: 2,
      isActive: true,
      taxId: null,
      categoryId: "cat_1",
      supplierId: "sup_1",
      projectId: null,
      organizationId: "org_1",
      recurringExpenseId: null,
      totalGenerated: 2,
      lastRunDate: new Date("2026-03-01"),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await generateExpensesForRecurring(mockDb as any, rec as any, now);

    expect(mockTx.recurringExpense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastRunDate: expect.any(Date),
          totalGenerated: expect.objectContaining({ increment: 1 }),
        }),
      }),
    );
  });

  it("creates audit log entry for generated expense", async () => {
    const now = new Date("2026-04-01T06:00:00Z");
    const rec = {
      id: "re_1",
      name: "Monthly SaaS",
      description: null,
      qty: 1,
      rate: { toNumber: () => 99.99 } as any,
      reimbursable: false,
      frequency: "MONTHLY" as const,
      interval: 1,
      startDate: new Date("2026-03-01"),
      nextRunAt: new Date("2026-04-01"),
      endDate: null,
      maxOccurrences: null,
      occurrenceCount: 0,
      isActive: true,
      taxId: null,
      categoryId: null,
      supplierId: null,
      projectId: null,
      organizationId: "org_1",
      recurringExpenseId: null,
      totalGenerated: 0,
      lastRunDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await generateExpensesForRecurring(mockDb as any, rec as any, now);

    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATED",
        entityType: "Expense",
        organizationId: "org_1",
      }),
    });
  });

  it("creates notification for organization owner", async () => {
    const now = new Date("2026-04-01T06:00:00Z");
    const rec = {
      id: "re_1",
      name: "Monthly SaaS",
      description: null,
      qty: 1,
      rate: { toNumber: () => 50 } as any,
      reimbursable: false,
      frequency: "MONTHLY" as const,
      interval: 1,
      startDate: new Date("2026-03-01"),
      nextRunAt: new Date("2026-04-01"),
      endDate: null,
      maxOccurrences: null,
      occurrenceCount: 0,
      isActive: true,
      taxId: null,
      categoryId: null,
      supplierId: "sup_1",
      projectId: null,
      organizationId: "org_1",
      recurringExpenseId: null,
      totalGenerated: 0,
      lastRunDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Mock owner lookup
    mockTx.user = {
      findFirst: vi.fn().mockResolvedValue({ id: "user_owner" }),
    };

    await generateExpensesForRecurring(mockDb as any, rec as any, now);

    expect(mockTx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "RECURRING_EXPENSE_GENERATED",
        organizationId: "org_1",
      }),
    });
  });

  it("auto-deactivates when endDate is reached", async () => {
    const now = new Date("2026-04-01T06:00:00Z");
    const rec = {
      id: "re_1",
      name: "Monthly SaaS",
      description: null,
      qty: 1,
      rate: { toNumber: () => 50 } as any,
      reimbursable: false,
      frequency: "MONTHLY" as const,
      interval: 1,
      startDate: new Date("2026-01-01"),
      nextRunAt: new Date("2026-04-01"),
      endDate: new Date("2026-04-15"),
      maxOccurrences: null,
      occurrenceCount: 3,
      isActive: true,
      taxId: null,
      categoryId: null,
      supplierId: null,
      projectId: null,
      organizationId: "org_1",
      recurringExpenseId: null,
      totalGenerated: 3,
      lastRunDate: new Date("2026-03-01"),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await generateExpensesForRecurring(mockDb as any, rec as any, now);

    // nextRunAt after generation would be May 1, which is past endDate Apr 15
    expect(mockTx.recurringExpense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: false,
        }),
      }),
    );
  });
});
```

### Run test (should fail)
```bash
npx vitest run src/test/recurring-expense-tracking.test.ts
```

### Implementation

#### 1. Prisma schema changes

In `prisma/schema.prisma`, modify the `RecurringExpense` model (around line 652). Add two new fields after `isActive`:

```prisma
model RecurringExpense {
  id              String             @id @default(cuid())
  name            String
  description     String?
  qty             Int                @default(1)
  rate            Decimal            @db.Decimal(20, 10)
  reimbursable    Boolean            @default(false)

  frequency       RecurringFrequency
  interval        Int                @default(1)
  startDate       DateTime
  nextRunAt       DateTime
  endDate         DateTime?
  maxOccurrences  Int?
  occurrenceCount Int                @default(0)
  isActive        Boolean            @default(true)
  lastRunDate     DateTime?
  totalGenerated  Int                @default(0)

  // ... rest unchanged
}
```

#### 2. Add NotificationType enum value

In `prisma/schema.prisma`, add to the `NotificationType` enum (line 78-89):

```prisma
enum NotificationType {
  INVOICE_SENT
  INVOICE_VIEWED
  INVOICE_PAID
  INVOICE_OVERDUE
  INVOICE_COMMENT
  ESTIMATE_ACCEPTED
  ESTIMATE_REJECTED
  RECURRING_INVOICE_GENERATED
  RECURRING_EXPENSE_GENERATED
  TICKET_CREATED
  TICKET_REPLIED
}
```

#### 3. Create migration
```bash
npx prisma migrate dev --name add_recurring_expense_tracking
```

#### 4. Update generator service

**Modify:** `src/server/services/recurring-expense-generator.ts`

Replace the entire file with:

```typescript
import { PrismaClient, RecurringExpense } from "@/generated/prisma";
import { computeNextRunAt } from "@/inngest/functions/recurring-invoices";

/**
 * Generate all due expenses for a single recurring expense template.
 * Handles catch-up for multiple missed occurrences.
 * Each occurrence is created atomically with its schedule advancement.
 */
export async function generateExpensesForRecurring(
  db: PrismaClient,
  rec: RecurringExpense,
  now: Date,
): Promise<number> {
  let nextRun = new Date(rec.nextRunAt);
  let count = rec.occurrenceCount;
  let generated = 0;

  while (nextRun <= now) {
    if (rec.maxOccurrences !== null && count >= rec.maxOccurrences) break;
    if (rec.endDate !== null && nextRun > rec.endDate) break;

    await db.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          name: rec.name,
          description: rec.description,
          qty: rec.qty,
          rate: rec.rate,
          reimbursable: rec.reimbursable,
          dueDate: nextRun,
          taxId: rec.taxId,
          categoryId: rec.categoryId,
          supplierId: rec.supplierId,
          projectId: rec.projectId,
          organizationId: rec.organizationId,
          recurringExpenseId: rec.id,
        },
      });

      count++;
      const newNextRun = computeNextRunAt(nextRun, rec.frequency, rec.interval);
      const maxReached = rec.maxOccurrences !== null && count >= rec.maxOccurrences;
      const pastEnd = rec.endDate !== null && newNextRun > rec.endDate;

      await tx.recurringExpense.update({
        where: { id: rec.id },
        data: {
          occurrenceCount: count,
          nextRunAt: newNextRun,
          isActive: !(maxReached || pastEnd),
          lastRunDate: nextRun,
          totalGenerated: { increment: 1 },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: "CREATED",
          entityType: "Expense",
          entityId: expense.id,
          entityLabel: rec.name,
          organizationId: rec.organizationId,
        },
      });

      // Notification to org owner
      const owner = await tx.user.findFirst({
        where: { organizationId: rec.organizationId, role: "OWNER" },
        select: { id: true },
      });

      if (owner) {
        const amount = Number(rec.rate) * rec.qty;
        await tx.notification.create({
          data: {
            type: "RECURRING_EXPENSE_GENERATED",
            title: "Recurring expense generated",
            body: `Recurring expense generated: $${amount.toFixed(2)} for ${rec.name}`,
            userId: owner.id,
            link: `/expenses`,
            organizationId: rec.organizationId,
          },
        });
      }

      nextRun = newNextRun;
    });

    generated++;
  }

  return generated;
}
```

### Run test (should pass)
```bash
npx vitest run src/test/recurring-expense-tracking.test.ts
```

### Expected output
```
 ✓ src/test/recurring-expense-tracking.test.ts (4 tests)
   ✓ Recurring Expense Generator - Tracking Fields
     ✓ sets lastRunDate when generating an expense
     ✓ creates audit log entry for generated expense
     ✓ creates notification for organization owner
     ✓ auto-deactivates when endDate is reached

 Test Files  1 passed (1)
 Tests       4 passed (4)
```

### Git commit
```bash
git add prisma/schema.prisma src/server/services/recurring-expense-generator.ts src/test/recurring-expense-tracking.test.ts
git commit -m "$(cat <<'EOF'
feat(C3): add tracking fields and audit/notification to recurring expense generation

Add lastRunDate, totalGenerated fields to RecurringExpense model.
Add RECURRING_EXPENSE_GENERATED notification type. Generator now creates
audit log entries and notifies the org owner on each generated expense.
EOF
)"
```

---

## C3-Step 2: Update RecurringExpenseList UI with Active/Paused toggle and badges

### Files
- **Modify:** `src/components/expenses/RecurringExpenseList.tsx`
- **Modify:** `src/components/expenses/ExpenseList.tsx`

### Implementation

#### 1. RecurringExpenseList.tsx - Add lastRunDate and totalGenerated columns

In `src/components/expenses/RecurringExpenseList.tsx`, update the table header row (line 92-99) to show "Last Run" and "Generated" instead of the current "Created" column:

Replace the `<thead>` content (lines 91-99):

```tsx
<tr className="border-b border-border/40">
  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Frequency</th>
  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Next Run</th>
  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Run</th>
  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Generated</th>
  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
</tr>
```

Update the table body cells for each row (replace the "Created" `<td>` at line 116-118):

Replace:
```tsx
<td className="px-6 py-3.5 text-center text-muted-foreground tabular-nums">
  {item.occurrenceCount}
</td>
```

With:
```tsx
<td className="px-6 py-3.5 text-muted-foreground text-xs">
  {item.lastRunDate ? new Date(item.lastRunDate).toLocaleDateString() : "Never"}
</td>
<td className="px-6 py-3.5 text-center text-muted-foreground tabular-nums">
  {item.totalGenerated ?? item.occurrenceCount}
</td>
```

#### 2. ExpenseList.tsx - Add "recurring" badge with link to template

The ExpenseList already shows a `<Repeat>` icon linking to the recurring template (lines 238-246). This is already implemented. No changes needed here beyond verifying it works with the new fields.

### Git commit
```bash
git add src/components/expenses/RecurringExpenseList.tsx
git commit -m "$(cat <<'EOF'
feat(C3): show lastRunDate and totalGenerated in recurring expense list

Display last run date and total generated count in the recurring expense
table, replacing the generic occurrence count column.
EOF
)"
```

---

## C3-Step 3: Update mock context for new models

### Files
- **Modify:** `src/test/mocks/prisma.ts`

### Implementation

Add `recurringExpense` and `user.findFirst` to the mock client if not present. In `src/test/mocks/prisma.ts`, add after `expenseSupplier` (around line 163):

```typescript
recurringExpense: {
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
},
```

The `user` mock already has `findFirst` — but it is missing. Add it:

Replace line 84-86:
```typescript
user: {
  findUnique: vi.fn(),
  findMany: vi.fn(),
},
```
With:
```typescript
user: {
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
},
```

Also add `notification.create`:

Replace the notification mock (lines 176-180):
```typescript
notification: {
  findMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
},
```

### Git commit
```bash
git add src/test/mocks/prisma.ts
git commit -m "$(cat <<'EOF'
fix(C3): update test mocks with recurringExpense and missing methods

Add recurringExpense model mock, user.findFirst, and notification.create
to support recurring expense generator tests.
EOF
)"
```

---

# C1: Expense Receipt OCR

## C1-Step 1: Add OCR fields to Expense model

### Files
- **Modify:** `prisma/schema.prisma` (Expense model, lines 620-648)
- **Create:** `prisma/migrations/<timestamp>_add_expense_ocr_fields/migration.sql`

### Implementation

Add two new fields to the `Expense` model after `receiptUrl` (line 631):

```prisma
model Expense {
  id             String   @id @default(cuid())
  name           String
  description    String?
  qty            Int      @default(1)
  rate           Decimal  @db.Decimal(20, 10)
  dueDate        DateTime?
  paymentDetails String?
  paidAt         DateTime?
  reimbursable   Boolean  @default(false)
  receiptUrl     String?
  ocrRawResult   Json?
  ocrConfidence  Float?
  invoiceLineId  String?
  // ... rest unchanged
}
```

### Migration
```bash
npx prisma migrate dev --name add_expense_ocr_fields
```

### Git commit
```bash
git add prisma/schema.prisma
git commit -m "$(cat <<'EOF'
feat(C1): add ocrRawResult and ocrConfidence fields to Expense model

JSON field for raw OCR results and float for confidence score to support
receipt scanning feature.
EOF
)"
```

---

## C1-Step 2: Create OCR API endpoint

### Files
- **Create:** `src/app/api/expenses/receipt/ocr/route.ts`
- **Create:** `src/server/services/receipt-ocr.ts`
- **Modify:** `src/lib/env.ts` (add ANTHROPIC_API_KEY)

### Test (write first)
- **Create:** `src/test/receipt-ocr.test.ts`

```typescript
// src/test/receipt-ocr.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseReceiptWithOCR, type OCRResult } from "@/server/services/receipt-ocr";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

describe("Receipt OCR Service", () => {
  let mockAnthropicCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const instance = new Anthropic();
    mockAnthropicCreate = instance.messages.create as ReturnType<typeof vi.fn>;
  });

  it("parses a receipt image and returns structured data", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            vendor: "Staples",
            amount: 42.99,
            currency: "USD",
            date: "2026-03-15",
            category: "Office Supplies",
            confidence: 0.95,
            lineItems: [
              { description: "Paper A4", amount: 22.99 },
              { description: "Pens 12-pack", amount: 20.00 },
            ],
          }),
        },
      ],
    });

    const imageBuffer = Buffer.from("fake-image-data");
    const result = await parseReceiptWithOCR(imageBuffer, "image/jpeg");

    expect(result).toBeDefined();
    expect(result.vendor).toBe("Staples");
    expect(result.amount).toBe(42.99);
    expect(result.currency).toBe("USD");
    expect(result.date).toBe("2026-03-15");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("returns low confidence when parsing fails partially", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            vendor: null,
            amount: 42.99,
            currency: "USD",
            date: null,
            category: null,
            confidence: 0.4,
            lineItems: [],
          }),
        },
      ],
    });

    const imageBuffer = Buffer.from("blurry-receipt");
    const result = await parseReceiptWithOCR(imageBuffer, "image/jpeg");

    expect(result.confidence).toBeLessThan(0.5);
    expect(result.vendor).toBeNull();
  });

  it("handles API errors gracefully", async () => {
    mockAnthropicCreate.mockRejectedValue(new Error("API rate limited"));

    const imageBuffer = Buffer.from("fake-image-data");

    await expect(
      parseReceiptWithOCR(imageBuffer, "image/jpeg"),
    ).rejects.toThrow("API rate limited");
  });

  it("handles non-JSON response from API", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "I cannot read this receipt clearly.",
        },
      ],
    });

    const imageBuffer = Buffer.from("corrupt-image");

    await expect(
      parseReceiptWithOCR(imageBuffer, "image/jpeg"),
    ).rejects.toThrow();
  });
});
```

### Run test (should fail)
```bash
npx vitest run src/test/receipt-ocr.test.ts
```

### Implementation

#### 1. Add ANTHROPIC_API_KEY to env

**Modify:** `src/lib/env.ts` — add to the `server` object (after line 16):

```typescript
ANTHROPIC_API_KEY: z.string().min(1).optional(),
```

Add to `runtimeEnv` (after line 31):
```typescript
ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
```

#### 2. Install Anthropic SDK
```bash
npm install @anthropic-ai/sdk
```

#### 3. Create OCR service

**Create:** `src/server/services/receipt-ocr.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

export interface OCRResult {
  vendor: string | null;
  amount: number | null;
  currency: string;
  date: string | null;
  category: string | null;
  confidence: number;
  lineItems: Array<{ description: string; amount: number }>;
  rawResponse: Record<string, unknown>;
}

const SYSTEM_PROMPT = `You are a receipt parser. Analyze the receipt image and extract structured data.
Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "vendor": "Business name or null if unreadable",
  "amount": 42.99,
  "currency": "USD",
  "date": "YYYY-MM-DD or null",
  "category": "Best guess category (Office Supplies, Software, Travel, Meals, etc.) or null",
  "confidence": 0.95,
  "lineItems": [{"description": "Item name", "amount": 12.99}]
}
The confidence field should be 0.0-1.0 reflecting how certain you are about the extracted data overall.
If the image is not a receipt, return confidence: 0 with null fields.`;

export async function parseReceiptWithOCR(
  imageData: Buffer,
  mimeType: string,
): Promise<OCRResult> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const anthropic = new Anthropic({ apiKey });

  const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageData.toString("base64"),
            },
          },
          {
            type: "text",
            text: "Parse this receipt and return the structured JSON data.",
          },
        ],
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from OCR API");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new Error("OCR API returned non-JSON response");
  }

  return {
    vendor: (parsed.vendor as string) ?? null,
    amount: typeof parsed.amount === "number" ? parsed.amount : null,
    currency: (parsed.currency as string) ?? "USD",
    date: (parsed.date as string) ?? null,
    category: (parsed.category as string) ?? null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    lineItems: Array.isArray(parsed.lineItems) ? parsed.lineItems : [],
    rawResponse: parsed,
  };
}
```

#### 4. Create OCR API route

**Create:** `src/app/api/expenses/receipt/ocr/route.ts`

```typescript
import { createClient } from "@/lib/supabase/server";
import { parseReceiptWithOCR } from "@/server/services/receipt-ocr";
import { db } from "@/server/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
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
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF, PDF" },
        { status: 400 },
      );
    }

    // For PDF, we need to handle differently — for now, only image OCR
    if (file.type === "application/pdf") {
      return NextResponse.json(
        { error: "PDF OCR is not yet supported. Please upload an image of the receipt." },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ocrResult = await parseReceiptWithOCR(buffer, file.type);

    // Try to match vendor to existing ExpenseSupplier
    let matchedSupplierId: string | null = null;
    if (ocrResult.vendor) {
      const supplier = await db.expenseSupplier.findFirst({
        where: {
          organizationId: orgId,
          name: { contains: ocrResult.vendor, mode: "insensitive" },
        },
      });
      matchedSupplierId = supplier?.id ?? null;
    }

    // Try to match category
    let matchedCategoryId: string | null = null;
    if (ocrResult.category) {
      const category = await db.expenseCategory.findFirst({
        where: {
          organizationId: orgId,
          name: { contains: ocrResult.category, mode: "insensitive" },
        },
      });
      matchedCategoryId = category?.id ?? null;
    }

    return NextResponse.json({
      ocr: ocrResult,
      matches: {
        supplierId: matchedSupplierId,
        categoryId: matchedCategoryId,
      },
    });
  } catch (err) {
    console.error("[receipt OCR]", err);
    const message = err instanceof Error ? err.message : "OCR failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

### Run test (should pass)
```bash
npx vitest run src/test/receipt-ocr.test.ts
```

### Expected output
```
 ✓ src/test/receipt-ocr.test.ts (4 tests)
   ✓ Receipt OCR Service
     ✓ parses a receipt image and returns structured data
     ✓ returns low confidence when parsing fails partially
     ✓ handles API errors gracefully
     ✓ handles non-JSON response from API

 Test Files  1 passed (1)
 Tests       4 passed (4)
```

### Git commit
```bash
git add src/lib/env.ts src/server/services/receipt-ocr.ts src/app/api/expenses/receipt/ocr/route.ts src/test/receipt-ocr.test.ts prisma/schema.prisma
git commit -m "$(cat <<'EOF'
feat(C1): add receipt OCR endpoint using Claude Vision API

New /api/expenses/receipt/ocr endpoint accepts receipt images and returns
structured data (vendor, amount, date, category) with confidence scores.
Matches extracted vendor/category to existing org records.
EOF
)"
```

---

## C1-Step 3: Add "Scan Receipt" dropzone to ExpenseForm

### Files
- **Create:** `src/components/expenses/ReceiptOCRDropzone.tsx`
- **Modify:** `src/components/expenses/ExpenseForm.tsx`

### Implementation

#### 1. Create ReceiptOCRDropzone component

**Create:** `src/components/expenses/ReceiptOCRDropzone.tsx`

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Camera, Loader2, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OCRResponse = {
  ocr: {
    vendor: string | null;
    amount: number | null;
    currency: string;
    date: string | null;
    category: string | null;
    confidence: number;
    lineItems: Array<{ description: string; amount: number }>;
    rawResponse: Record<string, unknown>;
  };
  matches: {
    supplierId: string | null;
    categoryId: string | null;
  };
};

type Props = {
  onResult: (result: OCRResponse) => void;
  onReceiptUploaded: (url: string) => void;
  disabled?: boolean;
};

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.8) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
        <CheckCircle className="w-3.5 h-3.5" />
        High confidence ({Math.round(confidence * 100)}%)
      </span>
    );
  }
  if (confidence >= 0.5) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
        <AlertTriangle className="w-3.5 h-3.5" />
        Medium confidence ({Math.round(confidence * 100)}%)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
      <XCircle className="w-3.5 h-3.5" />
      Low confidence ({Math.round(confidence * 100)}%)
    </span>
  );
}

export function ReceiptOCRDropzone({ onResult, onReceiptUploaded, disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastConfidence, setLastConfidence] = useState<number | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      setScanning(true);
      setError(null);
      setLastConfidence(null);

      try {
        // Step 1: Upload receipt to storage
        const uploadBody = new FormData();
        uploadBody.append("file", file);
        const uploadRes = await fetch("/api/expenses/receipt", {
          method: "POST",
          body: uploadBody,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error ?? "Upload failed");
        onReceiptUploaded(uploadData.url);

        // Step 2: OCR the receipt
        const ocrBody = new FormData();
        ocrBody.append("file", file);
        const ocrRes = await fetch("/api/expenses/receipt/ocr", {
          method: "POST",
          body: ocrBody,
        });
        const ocrData = await ocrRes.json();
        if (!ocrRes.ok) throw new Error(ocrData.error ?? "OCR failed");

        setLastConfidence(ocrData.ocr.confidence);
        onResult(ocrData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Scan failed");
      } finally {
        setScanning(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [onResult, onReceiptUploaded],
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Scan Receipt</label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 transition-colors cursor-pointer",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border/60 hover:border-primary/40 hover:bg-accent/20",
          scanning && "pointer-events-none opacity-60",
        )}
        onClick={() => !scanning && fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleChange}
          className="hidden"
          disabled={disabled || scanning}
        />

        {scanning ? (
          <>
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Scanning receipt...</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Camera className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  Drop a receipt image here or click to upload
                </p>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG, WebP -- we will extract vendor, amount, date
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {lastConfidence !== null && (
        <ConfidenceBadge confidence={lastConfidence} />
      )}
    </div>
  );
}
```

#### 2. Integrate into ExpenseForm

**Modify:** `src/components/expenses/ExpenseForm.tsx`

Add import at top (after line 17):
```tsx
import { ReceiptOCRDropzone } from "./ReceiptOCRDropzone";
```

Add OCR callback function inside the component (after line 79, before `handleReceiptChange`):

```tsx
  function handleOCRResult(result: {
    ocr: {
      vendor: string | null;
      amount: number | null;
      currency: string;
      date: string | null;
      category: string | null;
      confidence: number;
      rawResponse: Record<string, unknown>;
    };
    matches: { supplierId: string | null; categoryId: string | null };
  }) {
    setForm((prev) => ({
      ...prev,
      ...(result.ocr.vendor && !prev.name ? { name: result.ocr.vendor } : {}),
      ...(result.ocr.amount != null && !prev.rate ? { rate: String(result.ocr.amount) } : {}),
      ...(result.ocr.date && !prev.dueDate ? { dueDate: result.ocr.date } : {}),
      ...(result.matches.supplierId && !prev.supplierId
        ? { supplierId: result.matches.supplierId }
        : {}),
      ...(result.matches.categoryId && !prev.categoryId
        ? { categoryId: result.matches.categoryId }
        : {}),
    }));
  }
```

Add the dropzone at the top of the form, right after the error display (after line 172, before the `{/* Name */}` comment):

```tsx
      {/* OCR Dropzone - only show on create mode when no receipt attached */}
      {mode === "create" && !receiptUrl && (
        <ReceiptOCRDropzone
          onResult={handleOCRResult}
          onReceiptUploaded={(url) => setReceiptUrl(url)}
          disabled={isPending}
        />
      )}
```

Also add `ocrRawResult` and `ocrConfidence` to the create mutation data. Modify the `handleSubmit` function. Add state for OCR raw data (after line 79):

```tsx
  const [ocrData, setOcrData] = useState<{ rawResult: Record<string, unknown>; confidence: number } | null>(null);
```

Update the `handleOCRResult` function to also store raw data:

```tsx
  function handleOCRResult(result: {
    ocr: {
      vendor: string | null;
      amount: number | null;
      currency: string;
      date: string | null;
      category: string | null;
      confidence: number;
      rawResponse: Record<string, unknown>;
    };
    matches: { supplierId: string | null; categoryId: string | null };
  }) {
    // Store OCR raw data for saving with expense
    setOcrData({
      rawResult: result.ocr.rawResponse,
      confidence: result.ocr.confidence,
    });

    // Pre-fill form fields (only fill empty fields)
    setForm((prev) => ({
      ...prev,
      ...(result.ocr.vendor && !prev.name ? { name: result.ocr.vendor } : {}),
      ...(result.ocr.amount != null && !prev.rate ? { rate: String(result.ocr.amount) } : {}),
      ...(result.ocr.date && !prev.dueDate ? { dueDate: result.ocr.date } : {}),
      ...(result.matches.supplierId && !prev.supplierId
        ? { supplierId: result.matches.supplierId }
        : {}),
      ...(result.matches.categoryId && !prev.categoryId
        ? { categoryId: result.matches.categoryId }
        : {}),
    }));
  }
```

**Note:** The `ocrRawResult` and `ocrConfidence` fields will be passed through the expense create mutation. Update the tRPC expense create input schema to accept them (see next step).

### Git commit
```bash
git add src/components/expenses/ReceiptOCRDropzone.tsx src/components/expenses/ExpenseForm.tsx
git commit -m "$(cat <<'EOF'
feat(C1): add receipt OCR dropzone to expense create form

New ReceiptOCRDropzone component with drag-and-drop, confidence badges
(green/yellow/red), and auto-fill of form fields from OCR results.
Only shown in create mode when no receipt is attached.
EOF
)"
```

---

## C1-Step 4: Update expense router to accept OCR fields

### Files
- **Modify:** `src/server/routers/expenses.ts`

### Implementation

Update the `create` input schema (lines 76-92) to include OCR fields:

Add to the create input `z.object` (after `supplierId` on line 91):
```typescript
ocrRawResult: z.record(z.unknown()).optional(),
ocrConfidence: z.number().min(0).max(1).optional(),
```

The `create` mutation spreads input into data (line 94-95), so these fields will be passed directly to Prisma.

Similarly, update the `update` input to allow setting OCR data:

Add to the update input (after `receiptUrl` on line 117):
```typescript
ocrRawResult: z.record(z.unknown()).nullable().optional(),
ocrConfidence: z.number().min(0).max(1).nullable().optional(),
```

### Git commit
```bash
git add src/server/routers/expenses.ts
git commit -m "$(cat <<'EOF'
feat(C1): accept ocrRawResult and ocrConfidence in expense create/update

Extend expense tRPC procedures to persist OCR metadata alongside the
expense record.
EOF
)"
```

---

# C2: Dashboard / KPIs Homepage

## C2-Step 1: Install recharts

### Command
```bash
npm install recharts
```

### Git commit
```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore(C2): add recharts dependency for dashboard charts
EOF
)"
```

---

## C2-Step 2: Create dashboardSummary tRPC procedure

### Files
- **Create:** `src/server/routers/dashboard.ts`
- **Modify:** `src/server/routers/_app.ts`

### Test (write first)
- **Create:** `src/test/routers-dashboard.test.ts`

```typescript
// src/test/routers-dashboard.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { dashboardRouter } from "@/server/routers/dashboard";
import { createMockContext } from "./mocks/trpc-context";
import { Decimal } from "@prisma/client-runtime-utils";

describe("Dashboard Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = dashboardRouter.createCaller(ctx);
  });

  describe("summary", () => {
    it("returns aggregated dashboard metrics", async () => {
      // Mock payments (this month + last month)
      ctx.db.payment.findMany
        .mockResolvedValueOnce([
          { amount: new Decimal("500"), paidAt: new Date() },
          { amount: new Decimal("300"), paidAt: new Date() },
        ]) // this month
        .mockResolvedValueOnce([
          { amount: new Decimal("400"), paidAt: new Date() },
        ]); // last month

      // Mock outstanding invoices
      ctx.db.invoice.findMany
        .mockResolvedValueOnce([
          { id: "inv_1", total: new Decimal("1000"), status: "SENT" },
          { id: "inv_2", total: new Decimal("500"), status: "PARTIALLY_PAID" },
        ]) // outstanding
        .mockResolvedValueOnce([
          { id: "inv_3", total: new Decimal("250"), status: "OVERDUE", dueDate: new Date("2026-01-01") },
        ]); // overdue

      // Mock expenses this month
      ctx.db.expense.findMany.mockResolvedValue([
        { rate: new Decimal("100"), qty: 2, createdAt: new Date() },
      ]);

      const result = await caller.summary({ range: "month" });

      expect(result).toEqual(
        expect.objectContaining({
          revenueThisMonth: 800,
          revenueLastMonth: 400,
          revenueChange: expect.any(Number),
          outstandingCount: 2,
          outstandingTotal: 1500,
          overdueCount: 1,
          overdueTotal: 250,
          cashCollected: 800,
          expensesThisMonth: 200,
        }),
      );
    });

    it("handles zero revenue last month without division error", async () => {
      ctx.db.payment.findMany
        .mockResolvedValueOnce([
          { amount: new Decimal("500"), paidAt: new Date() },
        ])
        .mockResolvedValueOnce([]); // no payments last month

      ctx.db.invoice.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      ctx.db.expense.findMany.mockResolvedValue([]);

      const result = await caller.summary({ range: "month" });

      expect(result.revenueChange).toBeNull(); // Can't compute % change from 0
      expect(result.revenueThisMonth).toBe(500);
    });
  });

  describe("revenueChart", () => {
    it("returns 12 months of revenue data", async () => {
      const payments = Array.from({ length: 12 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        return { amount: new Decimal(String((i + 1) * 100)), paidAt: d };
      });
      ctx.db.payment.findMany.mockResolvedValue(payments);

      const result = await caller.revenueChart();

      expect(result).toHaveLength(12);
      expect(result[0]).toEqual(
        expect.objectContaining({
          month: expect.any(String),
          revenue: expect.any(Number),
        }),
      );
    });
  });

  describe("invoiceStatusBreakdown", () => {
    it("groups invoices by status", async () => {
      ctx.db.invoice.groupBy.mockResolvedValue([
        { status: "DRAFT", _count: { id: 5 } },
        { status: "SENT", _count: { id: 10 } },
        { status: "PAID", _count: { id: 20 } },
        { status: "OVERDUE", _count: { id: 3 } },
      ]);

      const result = await caller.invoiceStatusBreakdown();

      expect(result).toEqual([
        { status: "DRAFT", count: 5 },
        { status: "SENT", count: 10 },
        { status: "PAID", count: 20 },
        { status: "OVERDUE", count: 3 },
      ]);
    });
  });

  describe("expensesVsRevenue", () => {
    it("returns 6 months of expenses vs revenue", async () => {
      ctx.db.payment.findMany.mockResolvedValue([
        { amount: new Decimal("1000"), paidAt: new Date() },
      ]);
      ctx.db.expense.findMany.mockResolvedValue([
        { rate: new Decimal("300"), qty: 1, createdAt: new Date() },
      ]);

      const result = await caller.expensesVsRevenue();

      expect(result).toHaveLength(6);
      expect(result[0]).toEqual(
        expect.objectContaining({
          month: expect.any(String),
          revenue: expect.any(Number),
          expenses: expect.any(Number),
        }),
      );
    });
  });
});
```

### Run test (should fail)
```bash
npx vitest run src/test/routers-dashboard.test.ts
```

### Implementation

**Create:** `src/server/routers/dashboard.ts`

```typescript
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { InvoiceStatus } from "@/generated/prisma";
import { groupByMonth } from "./reports";

export const dashboardRouter = router({
  summary: protectedProcedure
    .input(
      z.object({
        range: z.enum(["month", "quarter", "year"]).default("month"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const thisMonthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
      const lastMonthStart = new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
      const lastMonthEnd = new Date(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        0,
        23,
        59,
        59,
        999,
      );

      const [
        thisMonthPayments,
        lastMonthPayments,
        outstandingInvoices,
        overdueInvoices,
        expensesThisMonth,
      ] = await Promise.all([
        ctx.db.payment.findMany({
          where: { organizationId: ctx.orgId, paidAt: { gte: thisMonthStart } },
          select: { amount: true, paidAt: true },
        }),
        ctx.db.payment.findMany({
          where: {
            organizationId: ctx.orgId,
            paidAt: { gte: lastMonthStart, lte: lastMonthEnd },
          },
          select: { amount: true, paidAt: true },
        }),
        ctx.db.invoice.findMany({
          where: {
            organizationId: ctx.orgId,
            isArchived: false,
            status: {
              in: [
                InvoiceStatus.SENT,
                InvoiceStatus.PARTIALLY_PAID,
                InvoiceStatus.OVERDUE,
              ],
            },
          },
          select: { id: true, total: true, status: true },
        }),
        ctx.db.invoice.findMany({
          where: {
            organizationId: ctx.orgId,
            isArchived: false,
            status: InvoiceStatus.OVERDUE,
          },
          select: { id: true, total: true, dueDate: true },
        }),
        ctx.db.expense.findMany({
          where: {
            organizationId: ctx.orgId,
            createdAt: { gte: thisMonthStart },
          },
          select: { rate: true, qty: true, createdAt: true },
        }),
      ]);

      const revenueThisMonth = thisMonthPayments.reduce(
        (s, p) => s + Number(p.amount),
        0,
      );
      const revenueLastMonth = lastMonthPayments.reduce(
        (s, p) => s + Number(p.amount),
        0,
      );
      const revenueChange =
        revenueLastMonth > 0
          ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
          : null;

      const outstandingTotal = outstandingInvoices.reduce(
        (s, inv) => s + Number(inv.total),
        0,
      );
      const overdueTotal = overdueInvoices.reduce(
        (s, inv) => s + Number(inv.total),
        0,
      );

      const expTotal = expensesThisMonth.reduce(
        (s, e) => s + Number(e.rate) * e.qty,
        0,
      );

      return {
        revenueThisMonth,
        revenueLastMonth,
        revenueChange,
        outstandingCount: outstandingInvoices.length,
        outstandingTotal,
        overdueCount: overdueInvoices.length,
        overdueTotal,
        cashCollected: revenueThisMonth,
        expensesThisMonth: expTotal,
      };
    }),

  revenueChart: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const twelveMonthsAgo = new Date(
      now.getUTCFullYear(),
      now.getUTCMonth() - 11,
      1,
    );

    const payments = await ctx.db.payment.findMany({
      where: {
        organizationId: ctx.orgId,
        paidAt: { gte: twelveMonthsAgo },
      },
      select: { amount: true, paidAt: true },
    });

    const byMonth = groupByMonth(
      payments,
      (p) => p.paidAt,
      (p) => Number(p.amount),
    );

    // Build 12-month array
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getUTCFullYear(), now.getUTCMonth() - (11 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return {
        month: key,
        revenue: byMonth[key] ?? 0,
      };
    });
  }),

  invoiceStatusBreakdown: protectedProcedure.query(async ({ ctx }) => {
    const groups = await ctx.db.invoice.groupBy({
      by: ["status"],
      where: { organizationId: ctx.orgId, isArchived: false },
      _count: { id: true },
    });

    return groups.map((g) => ({
      status: g.status,
      count: g._count.id,
    }));
  }),

  expensesVsRevenue: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const sixMonthsAgo = new Date(
      now.getUTCFullYear(),
      now.getUTCMonth() - 5,
      1,
    );

    const [payments, expenses] = await Promise.all([
      ctx.db.payment.findMany({
        where: {
          organizationId: ctx.orgId,
          paidAt: { gte: sixMonthsAgo },
        },
        select: { amount: true, paidAt: true },
      }),
      ctx.db.expense.findMany({
        where: {
          organizationId: ctx.orgId,
          createdAt: { gte: sixMonthsAgo },
        },
        select: { rate: true, qty: true, createdAt: true },
      }),
    ]);

    const revenueByMonth = groupByMonth(
      payments,
      (p) => p.paidAt,
      (p) => Number(p.amount),
    );
    const expensesByMonth = groupByMonth(
      expenses,
      (e) => e.createdAt,
      (e) => Number(e.rate) * e.qty,
    );

    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getUTCFullYear(), now.getUTCMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return {
        month: key,
        revenue: revenueByMonth[key] ?? 0,
        expenses: expensesByMonth[key] ?? 0,
      };
    });
  }),

  activityFeed: protectedProcedure
    .input(z.object({ limit: z.number().int().max(20).default(10) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.auditLog.findMany({
        where: { organizationId: ctx.orgId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),
});
```

#### Register in app router

**Modify:** `src/server/routers/_app.ts`

Add import (after line 33):
```typescript
import { dashboardRouter } from "./dashboard";
```

Add to router object (after line 69, before the closing `});`):
```typescript
  dashboard: dashboardRouter,
```

#### Update mock with invoice.groupBy

**Modify:** `src/test/mocks/prisma.ts`

Add `groupBy` to the invoice mock. Replace the `invoice` entry (lines 10-18):

```typescript
invoice: {
  create: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
},
```

### Run test (should pass)
```bash
npx vitest run src/test/routers-dashboard.test.ts
```

### Expected output
```
 ✓ src/test/routers-dashboard.test.ts (5 tests)
   ✓ Dashboard Router
     ✓ summary > returns aggregated dashboard metrics
     ✓ summary > handles zero revenue last month without division error
     ✓ revenueChart > returns 12 months of revenue data
     ✓ invoiceStatusBreakdown > groups invoices by status
     ✓ expensesVsRevenue > returns 6 months of expenses vs revenue

 Test Files  1 passed (1)
 Tests       5 passed (5)
```

### Git commit
```bash
git add src/server/routers/dashboard.ts src/server/routers/_app.ts src/test/routers-dashboard.test.ts src/test/mocks/prisma.ts
git commit -m "$(cat <<'EOF'
feat(C2): add dashboard tRPC router with summary, charts, and activity

New dashboardSummary procedure aggregates revenue, outstanding/overdue
invoices, expenses. Separate procedures for revenue chart (12mo),
invoice status donut, and expenses-vs-revenue (6mo).
EOF
)"
```

---

## C2-Step 3: Create chart components

### Files
- **Create:** `src/components/dashboard/RevenueChart.tsx`
- **Create:** `src/components/dashboard/InvoiceStatusChart.tsx`
- **Create:** `src/components/dashboard/ExpensesVsRevenueChart.tsx`
- **Create:** `src/components/dashboard/DateRangeSelector.tsx`
- **Create:** `src/components/dashboard/QuickActions.tsx`

### Implementation

#### 1. RevenueChart

**Create:** `src/components/dashboard/RevenueChart.tsx`

```tsx
"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

type Props = {
  data: Array<{ month: string; revenue: number }>;
};

function formatMonth(month: string) {
  const [y, m] = month.split("-");
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleDateString("en-US", { month: "short" });
}

function formatCurrency(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

export function RevenueChart({ data }: Props) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Revenue
        </p>
        <p className="text-sm font-semibold mt-0.5">Last 12 Months</p>
      </div>
      <div className="px-4 py-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonth}
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
            />
            <YAxis
              tickFormatter={formatCurrency}
              tick={{ fontSize: 11 }}
              width={50}
              className="text-muted-foreground"
            />
            <Tooltip
              formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
              labelFormatter={formatMonth}
              contentStyle={{
                borderRadius: "0.75rem",
                border: "1px solid hsl(var(--border))",
                fontSize: "0.75rem",
              }}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

#### 2. InvoiceStatusChart

**Create:** `src/components/dashboard/InvoiceStatusChart.tsx`

```tsx
"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

type Props = {
  data: Array<{ status: string; count: number }>;
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#9ca3af",
  SENT: "#f59e0b",
  PARTIALLY_PAID: "#3b82f6",
  PAID: "#10b981",
  OVERDUE: "#ef4444",
  ACCEPTED: "#8b5cf6",
  REJECTED: "#d1d5db",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Unpaid",
  PARTIALLY_PAID: "Partial",
  PAID: "Paid",
  OVERDUE: "Overdue",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
};

export function InvoiceStatusChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Invoices
        </p>
        <p className="text-sm font-semibold mt-0.5">
          Status Breakdown{" "}
          <span className="text-muted-foreground font-normal">({total})</span>
        </p>
      </div>
      <div className="px-4 py-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="status"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.status}
                  fill={STATUS_COLORS[entry.status] ?? "#6b7280"}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [
                value,
                STATUS_LABELS[name] ?? name,
              ]}
              contentStyle={{
                borderRadius: "0.75rem",
                border: "1px solid hsl(var(--border))",
                fontSize: "0.75rem",
              }}
            />
            <Legend
              formatter={(value: string) => STATUS_LABELS[value] ?? value}
              wrapperStyle={{ fontSize: "0.7rem" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

#### 3. ExpensesVsRevenueChart

**Create:** `src/components/dashboard/ExpensesVsRevenueChart.tsx`

```tsx
"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

type Props = {
  data: Array<{ month: string; revenue: number; expenses: number }>;
};

function formatMonth(month: string) {
  const [y, m] = month.split("-");
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleDateString("en-US", { month: "short" });
}

function formatCurrency(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

export function ExpensesVsRevenueChart({ data }: Props) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Comparison
        </p>
        <p className="text-sm font-semibold mt-0.5">Revenue vs Expenses (6 months)</p>
      </div>
      <div className="px-4 py-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonth}
              tick={{ fontSize: 11 }}
            />
            <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} width={50} />
            <Tooltip
              formatter={(value: number, name: string) => [
                `$${value.toLocaleString()}`,
                name === "revenue" ? "Revenue" : "Expenses",
              ]}
              labelFormatter={formatMonth}
              contentStyle={{
                borderRadius: "0.75rem",
                border: "1px solid hsl(var(--border))",
                fontSize: "0.75rem",
              }}
            />
            <Legend
              formatter={(value: string) =>
                value === "revenue" ? "Revenue" : "Expenses"
              }
              wrapperStyle={{ fontSize: "0.7rem" }}
            />
            <Bar
              dataKey="revenue"
              fill="hsl(var(--primary))"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="expenses"
              fill="#ef4444"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

#### 4. QuickActions

**Create:** `src/components/dashboard/QuickActions.tsx`

```tsx
import Link from "next/link";
import { FileText, UserPlus, Receipt, Clock } from "lucide-react";

const ACTIONS = [
  { label: "Create Invoice", href: "/invoices/new", icon: FileText, color: "text-primary bg-primary/10" },
  { label: "New Client", href: "/clients/new", icon: UserPlus, color: "text-violet-600 bg-violet-50" },
  { label: "Log Expense", href: "/expenses/new", icon: Receipt, color: "text-amber-600 bg-amber-50" },
  { label: "Start Timer", href: "/time", icon: Clock, color: "text-emerald-600 bg-emerald-50" },
];

export function QuickActions() {
  return (
    <div className="flex gap-2 flex-wrap">
      {ACTIONS.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-card px-3 py-2 text-sm font-medium hover:border-primary/30 hover:bg-accent/30 transition-colors"
        >
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${action.color}`}>
            <action.icon className="w-3.5 h-3.5" />
          </div>
          {action.label}
        </Link>
      ))}
    </div>
  );
}
```

### Git commit
```bash
git add src/components/dashboard/RevenueChart.tsx src/components/dashboard/InvoiceStatusChart.tsx src/components/dashboard/ExpensesVsRevenueChart.tsx src/components/dashboard/QuickActions.tsx
git commit -m "$(cat <<'EOF'
feat(C2): add recharts dashboard components

RevenueChart (12mo line), InvoiceStatusChart (donut), ExpensesVsRevenue
(stacked bar), and QuickActions bar for the dashboard homepage.
EOF
)"
```

---

## C2-Step 4: Rebuild dashboard page with charts and KPIs

### Files
- **Modify:** `src/app/(dashboard)/page.tsx`

### Implementation

Replace the entire content of `src/app/(dashboard)/page.tsx`:

```tsx
import { api } from "@/trpc/server";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { InvoiceStatus, InvoiceType } from "@/generated/prisma";
import {
  FileText,
  FolderOpen,
  AlertCircle,
  TrendingUp,
  Plus,
  Eye,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CashFlowWidget } from "@/components/dashboard/CashFlowWidget";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { InvoiceStatusChart } from "@/components/dashboard/InvoiceStatusChart";
import { ExpensesVsRevenueChart } from "@/components/dashboard/ExpensesVsRevenueChart";
import { QuickActions } from "@/components/dashboard/QuickActions";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<InvoiceStatus, { label: string; className: string; dot: string }> = {
  DRAFT:          { label: "Draft",    className: "bg-gray-100 text-gray-500",       dot: "bg-gray-400" },
  SENT:           { label: "Unpaid",   className: "bg-amber-50 text-amber-600",      dot: "bg-amber-500" },
  PARTIALLY_PAID: { label: "Partial",  className: "bg-blue-50 text-blue-600",        dot: "bg-blue-500" },
  PAID:           { label: "Paid",     className: "bg-emerald-50 text-emerald-600",  dot: "bg-emerald-500" },
  OVERDUE:        { label: "Overdue",  className: "bg-red-50 text-red-600",          dot: "bg-red-500" },
  ACCEPTED:       { label: "Accepted", className: "bg-primary/10 text-primary",      dot: "bg-primary" },
  REJECTED:       { label: "Rejected", className: "bg-gray-100 text-gray-400",       dot: "bg-gray-300" },
};

const TYPE_LABEL: Record<InvoiceType, string> = {
  DETAILED:    "Invoice",
  SIMPLE:      "Invoice",
  ESTIMATE:    "Estimate",
  CREDIT_NOTE: "Credit Note",
};

function formatDate(d: Date | null): string {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAmount(total: number | { toNumber(): number }, symbol: string, pos: string) {
  const val = typeof total === "object" ? total.toNumber() : total;
  return pos === "before" ? `${symbol}${val.toFixed(2)}` : `${val.toFixed(2)}${symbol}`;
}

function formatCurrencyCompact(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    summary,
    revenueChartData,
    statusBreakdown,
    expVsRevData,
    recentInvoicesResult,
    overdueInvoices,
    recentlyViewed,
    activityLog,
  ] = await Promise.all([
    api.dashboard.summary({ range: "month" }),
    api.dashboard.revenueChart(),
    api.dashboard.invoiceStatusBreakdown(),
    api.dashboard.expensesVsRevenue(),
    api.invoices.list({ includeArchived: false, pageSize: 6 }),
    api.reports.overdueInvoices(),
    api.invoices.recentlyViewed({ limit: 5 }).catch(() => []),
    api.auditLog.list({ limit: 8 }).catch(() => []),
  ]);

  const recentInvoices = recentInvoicesResult.items.slice(0, 6);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="space-y-5">

      {/* ── Greeting ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">
            {greeting}{user?.user_metadata?.firstName ? `, ${user.user_metadata.firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{dateLabel}</p>
        </div>
        <Button asChild size="sm">
          <Link href="/invoices/new">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Invoice
          </Link>
        </Button>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────── */}
      <QuickActions />

      {/* ── Top row: Summary cards ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Revenue (this month)"
          value={formatCurrencyCompact(summary.revenueThisMonth)}
          change={summary.revenueChange}
          color="text-emerald-600 bg-emerald-50"
          href="/reports"
        />
        <SummaryCard
          icon={<FileText className="w-4 h-4" />}
          label="Outstanding"
          value={formatCurrencyCompact(summary.outstandingTotal)}
          subtitle={`${summary.outstandingCount} invoice${summary.outstandingCount !== 1 ? "s" : ""}`}
          color="text-amber-600 bg-amber-50"
          href="/invoices"
        />
        <SummaryCard
          icon={<AlertCircle className="w-4 h-4" />}
          label="Overdue"
          value={String(summary.overdueCount)}
          subtitle={summary.overdueCount > 0 ? formatCurrencyCompact(summary.overdueTotal) : "all clear"}
          color={summary.overdueCount > 0 ? "text-red-600 bg-red-50" : "text-gray-400 bg-gray-100"}
          href="/invoices"
          alert={summary.overdueCount > 0}
        />
        <SummaryCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Cash Collected"
          value={formatCurrencyCompact(summary.cashCollected)}
          color="text-primary bg-primary/10"
          href="/reports"
        />
      </div>

      {/* ── Charts row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart data={revenueChartData} />
        </div>
        <InvoiceStatusChart data={statusBreakdown} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ExpensesVsRevenueChart data={expVsRevData} />
        <CashFlowWidget
          collectedThisMonth={summary.cashCollected}
          outstandingAR={summary.outstandingTotal}
          expensesThisMonth={summary.expensesThisMonth}
        />
      </div>

      {/* ── Main content grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* Recent invoices -- takes 2/3 width */}
        <div className="lg:col-span-2 rounded-2xl border border-border/50 bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Invoices
              </p>
              <p className="text-sm font-semibold mt-0.5">Recent Invoices</p>
            </div>
            <Link
              href="/invoices"
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>

          {recentInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-5">
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center mb-3">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
              <Button asChild size="sm" className="mt-3">
                <Link href="/invoices/new">Create Invoice</Link>
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Invoice
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Date
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {recentInvoices.map((inv) => {
                  const badge = STATUS_BADGE[inv.status];
                  return (
                    <tr key={inv.id} className="hover:bg-accent/20 transition-colors">
                      <td className="px-5 py-3">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-semibold hover:text-primary transition-colors"
                        >
                          <span className="font-mono text-xs text-muted-foreground mr-1">#{inv.number}</span>
                          {TYPE_LABEL[inv.type]}
                        </Link>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {inv.client.name}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">
                        {formatDate(inv.date)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-medium",
                            badge.className
                          )}
                        >
                          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", badge.dot)} />
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-semibold tabular-nums">
                        {formatAmount(inv.total, inv.currency.symbol, inv.currency.symbolPosition)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Overdue invoices */}
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Attention Needed
                </p>
                <p className="text-sm font-semibold mt-0.5">Overdue</p>
              </div>
              {overdueInvoices.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold">
                  {overdueInvoices.length}
                </span>
              )}
            </div>

            {overdueInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-5">
                <TrendingUp className="w-5 h-5 text-emerald-500 mb-2" />
                <p className="text-xs text-muted-foreground">All caught up!</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {overdueInvoices.slice(0, 4).map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-accent/20 transition-colors gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        #{inv.number} · {inv.client.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Due {formatDate(inv.dueDate)}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-red-600 shrink-0 tabular-nums">
                      {formatAmount(inv.total, inv.currency.symbol, inv.currency.symbolPosition)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recently viewed by clients */}
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Client Activity
                </p>
                <p className="text-sm font-semibold mt-0.5">Recently Viewed</p>
              </div>
              {recentlyViewed.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">
                  {recentlyViewed.length}
                </span>
              )}
            </div>

            {recentlyViewed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-5">
                <Eye className="w-5 h-5 text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">No invoices viewed yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {recentlyViewed.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-accent/20 transition-colors gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        #{inv.number} · {inv.client.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Viewed {formatDate(inv.lastViewed)}
                      </p>
                    </div>
                    <Eye className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Activity feed */}
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Feed</p>
              <p className="text-sm font-semibold mt-0.5">Recent Activity</p>
            </div>
            <ActivityFeed items={activityLog} />
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  subtitle,
  change,
  color,
  href,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  change?: number | null;
  color: string;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-2xl border bg-card p-4 flex flex-col gap-3 hover:border-primary/30 hover:bg-accent/30 transition-colors group overflow-hidden",
        alert ? "border-red-200" : "border-border/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", color)}>
          {icon}
        </div>
        {change != null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md",
              change >= 0
                ? "text-emerald-600 bg-emerald-50"
                : "text-red-600 bg-red-50",
            )}
          >
            {change >= 0 ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {Math.abs(change).toFixed(0)}%
          </span>
        )}
        {subtitle && !change && (
          <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
            {subtitle}
          </span>
        )}
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="font-display text-3xl mt-0.5 leading-none">{value}</p>
      </div>
    </Link>
  );
}
```

### Git commit
```bash
git add src/app/(dashboard)/page.tsx
git commit -m "$(cat <<'EOF'
feat(C2): rebuild dashboard homepage with KPI cards, charts, and quick actions

Dashboard now uses dedicated tRPC dashboard router for summary metrics,
revenue chart (12mo line), invoice status donut, expenses-vs-revenue bar
chart, quick actions bar, and existing overdue/activity widgets.
EOF
)"
```

---

## Final verification

### Run all tests
```bash
npx vitest run
```

### Run build
```bash
npm run build
```

### Run lint
```bash
npm run lint
```

---

## Summary of all files

### New files created
| File | Feature |
|------|---------|
| `src/test/recurring-expense-tracking.test.ts` | C3 |
| `src/server/services/receipt-ocr.ts` | C1 |
| `src/app/api/expenses/receipt/ocr/route.ts` | C1 |
| `src/test/receipt-ocr.test.ts` | C1 |
| `src/components/expenses/ReceiptOCRDropzone.tsx` | C1 |
| `src/server/routers/dashboard.ts` | C2 |
| `src/test/routers-dashboard.test.ts` | C2 |
| `src/components/dashboard/RevenueChart.tsx` | C2 |
| `src/components/dashboard/InvoiceStatusChart.tsx` | C2 |
| `src/components/dashboard/ExpensesVsRevenueChart.tsx` | C2 |
| `src/components/dashboard/QuickActions.tsx` | C2 |

### Modified files
| File | Feature |
|------|---------|
| `prisma/schema.prisma` | C3 (lastRunDate, totalGenerated, NotificationType enum), C1 (ocrRawResult, ocrConfidence) |
| `src/server/services/recurring-expense-generator.ts` | C3 |
| `src/components/expenses/RecurringExpenseList.tsx` | C3 |
| `src/test/mocks/prisma.ts` | C3, C2 |
| `src/lib/env.ts` | C1 |
| `src/components/expenses/ExpenseForm.tsx` | C1 |
| `src/server/routers/expenses.ts` | C1 |
| `src/server/routers/_app.ts` | C2 |
| `src/app/(dashboard)/page.tsx` | C2 |

### New dependencies
| Package | Feature |
|---------|---------|
| `@anthropic-ai/sdk` | C1 |
| `recharts` | C2 |

### New env vars
| Variable | Feature | Required |
|----------|---------|----------|
| `ANTHROPIC_API_KEY` | C1 | Optional (OCR disabled without it) |

### Prisma migrations needed
1. `add_recurring_expense_tracking` - lastRunDate, totalGenerated, RECURRING_EXPENSE_GENERATED enum
2. `add_expense_ocr_fields` - ocrRawResult (Json?), ocrConfidence (Float?)
