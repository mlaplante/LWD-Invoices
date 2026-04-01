# Group B: Client Portal Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the client portal with a self-service dashboard, e-signatures on proposals, and automated email sequences.

**Architecture:** The portal currently serves individual invoices at `/portal/[token]` using an invoice-specific `portalToken`. We will add a client-level dashboard at `/portal/dashboard/[clientToken]` using the existing `Client.portalToken` field for authentication. E-signatures extend the existing `ProposalContent` model with signature fields and a new audit log table. Email automations introduce a new Inngest-powered scheduling system with configurable triggers stored in the database.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui, tRPC v11, Prisma 7, PostgreSQL, Inngest (cron + event-driven), Resend (transactional email), React Email (templates), AES-256-GCM encryption (existing pattern).

---

## Table of Contents

- [B1: Client Self-Service Portal Dashboard](#b1-client-self-service-portal-dashboard)
  - [Task B1.1: Prisma Schema - ClientPortalSession Model](#task-b11-prisma-schema---clientportalsession-model)
  - [Task B1.2: Portal Dashboard tRPC Procedures](#task-b12-portal-dashboard-trpc-procedures)
  - [Task B1.3: Portal Dashboard Page & Layout](#task-b13-portal-dashboard-page--layout)
  - [Task B1.4: Summary Cards Component](#task-b14-summary-cards-component)
  - [Task B1.5: Invoice Table with Status Filter](#task-b15-invoice-table-with-status-filter)
  - [Task B1.6: Payment History & Active Projects Sections](#task-b16-payment-history--active-projects-sections)
  - [Task B1.7: Statement Download (PDF)](#task-b17-statement-download-pdf)
- [B2: E-Signatures on Proposals / Estimates](#b2-e-signatures-on-proposals--estimates)
  - [Task B2.1: Prisma Schema - Signature Fields & Audit Log](#task-b21-prisma-schema---signature-fields--audit-log)
  - [Task B2.2: Signature Helpers & Encryption](#task-b22-signature-helpers--encryption)
  - [Task B2.3: Portal Signature tRPC Procedure](#task-b23-portal-signature-trpc-procedure)
  - [Task B2.4: Signature Capture Widget (Canvas + Type)](#task-b24-signature-capture-widget-canvas--type)
  - [Task B2.5: Portal Proposal View with Signature](#task-b25-portal-proposal-view-with-signature)
  - [Task B2.6: Signed Proposal PDF Generation](#task-b26-signed-proposal-pdf-generation)
  - [Task B2.7: Signature Notification Email](#task-b27-signature-notification-email)
- [B3: Automated Thank-You / Follow-Up Sequences](#b3-automated-thank-you--follow-up-sequences)
  - [Task B3.1: Prisma Schema - EmailAutomation & EmailAutomationLog](#task-b31-prisma-schema---emailautomation--emailautomationlog)
  - [Task B3.2: Email Automation tRPC Router](#task-b32-email-automation-trpc-router)
  - [Task B3.3: Automation Template Variable Engine](#task-b33-automation-template-variable-engine)
  - [Task B3.4: Inngest Automation Processor Function](#task-b34-inngest-automation-processor-function)
  - [Task B3.5: Settings Page - Automations UI](#task-b35-settings-page---automations-ui)
  - [Task B3.6: Event Triggers Integration](#task-b36-event-triggers-integration)

---

## B1: Client Self-Service Portal Dashboard

### Task B1.1: Prisma Schema - ClientPortalSession Model

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `src/test/portal-dashboard-helpers.test.ts` (new)
- Run migration: `npx prisma migrate dev --name add-client-portal-session`

#### Step 1: Write failing test for session validation helpers

Create `src/test/portal-dashboard-helpers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  isSessionExpired,
  generateSessionToken,
  SESSION_DURATION_MS,
} from "@/server/services/portal-dashboard";

describe("Portal Dashboard Helpers", () => {
  describe("isSessionExpired", () => {
    it("returns false for session created just now", () => {
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
      expect(isSessionExpired(expiresAt)).toBe(false);
    });

    it("returns true for session expired 1 hour ago", () => {
      const expiresAt = new Date(Date.now() - 3600000);
      expect(isSessionExpired(expiresAt)).toBe(true);
    });

    it("returns true for session expiring exactly now", () => {
      const expiresAt = new Date(Date.now());
      expect(isSessionExpired(expiresAt)).toBe(true);
    });
  });

  describe("generateSessionToken", () => {
    it("returns a 64-character hex string", () => {
      const token = generateSessionToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it("generates unique tokens", () => {
      const a = generateSessionToken();
      const b = generateSessionToken();
      expect(a).not.toBe(b);
    });
  });
});
```

**Run:** `npx vitest run src/test/portal-dashboard-helpers.test.ts`
**Expected:** FAIL (module not found)

#### Step 2: Implement session helpers

Create `src/server/services/portal-dashboard.ts`:

```typescript
import { randomBytes } from "crypto";

/** Session duration: 30 days in milliseconds */
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Check if a portal session has expired.
 * Returns true if expiresAt is in the past or exactly now.
 */
export function isSessionExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}

/**
 * Generate a cryptographically secure session token (32 bytes / 64 hex chars).
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}
```

**Run:** `npx vitest run src/test/portal-dashboard-helpers.test.ts`
**Expected:** PASS (5 tests)

#### Step 3: Add Prisma schema

Add to `prisma/schema.prisma` after the `Client` model (after line 231):

```prisma
model ClientPortalSession {
  id        String   @id @default(cuid())
  token     String   @unique
  expiresAt DateTime
  userAgent String?
  ipAddress String?

  clientId String
  client   Client @relation(fields: [clientId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@index([token])
  @@index([clientId])
  @@index([expiresAt])
}
```

Also add relation to Client model. Find in `Client`:
```
  tickets        Ticket[]
```
Add after it:
```
  portalSessions ClientPortalSession[]
```

#### Step 4: Run migration

```bash
npx prisma migrate dev --name add-client-portal-session
```

#### Step 5: Update mock Prisma client

Add to `src/test/mocks/prisma.ts` inside `createMockPrismaClient()`:

```typescript
    clientPortalSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
```

#### Step 6: Commit

```bash
git add prisma/schema.prisma src/server/services/portal-dashboard.ts src/test/portal-dashboard-helpers.test.ts src/test/mocks/prisma.ts
git commit -m "$(cat <<'EOF'
feat(B1.1): add ClientPortalSession model and session helpers

Add Prisma model for managing client portal dashboard sessions with
token-based auth, expiry tracking, and IP/UA logging. Include helper
functions for session validation and token generation with tests.
EOF
)"
```

---

### Task B1.2: Portal Dashboard tRPC Procedures

**Files:**
- Modify: `src/server/routers/portal.ts`
- Modify: `src/server/routers/_app.ts` (if new router needed)
- Test: `src/test/portal-dashboard-procedures.test.ts` (new)

#### Step 1: Write failing tests

Create `src/test/portal-dashboard-procedures.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { portalRouter } from "@/server/routers/portal";
import { createMockContext } from "./mocks/trpc-context";
import { Decimal } from "@prisma/client-runtime-utils";
import { TRPCError } from "@trpc/server";

describe("Portal Dashboard Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    // Portal uses publicProcedure, so we need a context without auth
    ctx.orgId = undefined;
    ctx.userId = undefined;
    caller = portalRouter.createCaller(ctx);
  });

  describe("getDashboard", () => {
    it("returns client summary with invoices, projects, and payments", async () => {
      const mockClient = {
        id: "client_1",
        name: "Acme Corp",
        email: "acme@test.com",
        organizationId: "org_1",
        portalToken: "client-token-abc",
      };

      const mockSession = {
        id: "session_1",
        token: "session-token-xyz",
        expiresAt: new Date(Date.now() + 86400000),
        clientId: "client_1",
      };

      ctx.db.clientPortalSession.findFirst.mockResolvedValue(mockSession);
      ctx.db.client.findUnique.mockResolvedValue(mockClient);

      ctx.db.invoice.findMany.mockResolvedValue([
        {
          id: "inv_1",
          number: "INV-001",
          status: "SENT",
          total: new Decimal("1000.00"),
          date: new Date(),
          dueDate: new Date(),
          portalToken: "pt_1",
          currency: { symbol: "$", symbolPosition: "before", code: "USD" },
          payments: [],
        },
      ]);

      ctx.db.project.findMany.mockResolvedValue([]);
      ctx.db.payment.findMany.mockResolvedValue([]);

      const result = await caller.getDashboard({
        sessionToken: "session-token-xyz",
      });

      expect(result.client.name).toBe("Acme Corp");
      expect(result.invoices).toHaveLength(1);
    });

    it("throws NOT_FOUND for invalid session token", async () => {
      ctx.db.clientPortalSession.findFirst.mockResolvedValue(null);

      await expect(
        caller.getDashboard({ sessionToken: "invalid-token" })
      ).rejects.toThrow(TRPCError);
    });

    it("throws UNAUTHORIZED for expired session", async () => {
      ctx.db.clientPortalSession.findFirst.mockResolvedValue({
        id: "session_1",
        token: "expired-token",
        expiresAt: new Date(Date.now() - 86400000), // yesterday
        clientId: "client_1",
      });

      await expect(
        caller.getDashboard({ sessionToken: "expired-token" })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("createDashboardSession", () => {
    it("creates session for valid client portal token", async () => {
      const mockClient = {
        id: "client_1",
        portalPassphraseHash: null,
        portalToken: "client-token-abc",
      };

      ctx.db.client.findUnique.mockResolvedValue(mockClient);
      ctx.db.clientPortalSession.create.mockResolvedValue({
        id: "session_new",
        token: "generated-session-token",
        expiresAt: new Date(Date.now() + 86400000 * 30),
        clientId: "client_1",
      });

      const result = await caller.createDashboardSession({
        clientToken: "client-token-abc",
      });

      expect(result.sessionToken).toBeDefined();
      expect(ctx.db.clientPortalSession.create).toHaveBeenCalled();
    });

    it("throws NOT_FOUND for invalid client token", async () => {
      ctx.db.client.findUnique.mockResolvedValue(null);

      await expect(
        caller.createDashboardSession({ clientToken: "bad-token" })
      ).rejects.toThrow(TRPCError);
    });
  });
});
```

**Run:** `npx vitest run src/test/portal-dashboard-procedures.test.ts`
**Expected:** FAIL (procedures don't exist yet)

#### Step 2: Implement tRPC procedures

Add to `src/server/routers/portal.ts` inside the `portalRouter`:

```typescript
  // --- Dashboard procedures ---

  createDashboardSession: publicProcedure
    .input(
      z.object({
        clientToken: z.string(),
        passphrase: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.db.client.findUnique({
        where: { portalToken: input.clientToken },
        select: {
          id: true,
          portalPassphraseHash: true,
          portalToken: true,
        },
      });
      if (!client) throw new TRPCError({ code: "NOT_FOUND" });

      // If passphrase is set, verify it
      if (client.portalPassphraseHash) {
        const bcrypt = await import("bcryptjs");
        const match = await bcrypt.compare(
          input.passphrase ?? "",
          client.portalPassphraseHash
        );
        if (!match) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect passphrase" });
        }
      }

      const { generateSessionToken, SESSION_DURATION_MS } = await import(
        "../services/portal-dashboard"
      );

      const token = generateSessionToken();
      const session = await ctx.db.clientPortalSession.create({
        data: {
          token,
          clientId: client.id,
          expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
        },
      });

      return { sessionToken: session.token };
    }),

  getDashboard: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ ctx, input }) => {
      const { isSessionExpired } = await import("../services/portal-dashboard");

      const session = await ctx.db.clientPortalSession.findFirst({
        where: { token: input.sessionToken },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (isSessionExpired(session.expiresAt)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Session expired" });
      }

      const client = await ctx.db.client.findUnique({
        where: { id: session.clientId },
        select: {
          id: true,
          name: true,
          email: true,
          organizationId: true,
          portalToken: true,
        },
      });
      if (!client) throw new TRPCError({ code: "NOT_FOUND" });

      // Fetch all non-archived invoices for this client
      const invoices = await ctx.db.invoice.findMany({
        where: {
          clientId: client.id,
          organizationId: client.organizationId,
          isArchived: false,
        },
        include: {
          currency: { select: { symbol: true, symbolPosition: true, code: true } },
          payments: { select: { amount: true, paidAt: true, method: true } },
        },
        orderBy: { date: "desc" },
      });

      // Fetch active projects visible to client
      const projects = await ctx.db.project.findMany({
        where: {
          clientId: client.id,
          organizationId: client.organizationId,
          isViewable: true,
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          status: true,
          dueDate: true,
          projectedHours: true,
        },
        orderBy: { createdAt: "desc" },
      });

      // Fetch all payments across all invoices
      const payments = await ctx.db.payment.findMany({
        where: {
          invoice: {
            clientId: client.id,
            organizationId: client.organizationId,
          },
        },
        include: {
          invoice: { select: { number: true, currency: { select: { symbol: true } } } },
        },
        orderBy: { paidAt: "desc" },
        take: 20,
      });

      // Compute summary
      const outstanding = invoices
        .filter((inv) => ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status))
        .reduce((sum, inv) => {
          const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
          return sum + Number(inv.total) - paid;
        }, 0);

      const overdue = invoices
        .filter((inv) => inv.status === "OVERDUE")
        .reduce((sum, inv) => {
          const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
          return sum + Number(inv.total) - paid;
        }, 0);

      return {
        client: { id: client.id, name: client.name, email: client.email },
        summary: { outstanding, overdue, totalInvoices: invoices.length },
        invoices: invoices.map((inv) => ({
          id: inv.id,
          number: (inv as any).number,
          status: inv.status,
          date: inv.date,
          dueDate: inv.dueDate,
          total: Number(inv.total),
          amountPaid: inv.payments.reduce((s, p) => s + Number(p.amount), 0),
          portalToken: inv.portalToken,
          currency: inv.currency,
        })),
        projects,
        recentPayments: payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          method: p.method,
          paidAt: p.paidAt,
          invoiceNumber: p.invoice.number,
          currencySymbol: p.invoice.currency.symbol,
        })),
      };
    }),
```

Add the necessary import at the top of `portal.ts`:
```typescript
import bcrypt from "bcryptjs";
```

**Run:** `npx vitest run src/test/portal-dashboard-procedures.test.ts`
**Expected:** PASS (5 tests)

#### Step 3: Commit

```bash
git add src/server/routers/portal.ts src/test/portal-dashboard-procedures.test.ts
git commit -m "$(cat <<'EOF'
feat(B1.2): add portal dashboard tRPC procedures

Add createDashboardSession (with passphrase verification) and
getDashboard (returns invoices, projects, payments, summary stats)
to the portal router. Includes full test coverage.
EOF
)"
```

---

### Task B1.3: Portal Dashboard Page & Layout

**Files:**
- Create: `src/app/portal/dashboard/[clientToken]/page.tsx`
- Create: `src/app/portal/dashboard/[clientToken]/layout.tsx`
- Create: `src/app/portal/dashboard/[clientToken]/login/page.tsx`
- Create: `src/app/portal/dashboard/[clientToken]/loading.tsx`

#### Step 1: Create dashboard layout with session management

Create `src/app/portal/dashboard/[clientToken]/layout.tsx`:

```tsx
import { db } from "@/server/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isSessionExpired } from "@/server/services/portal-dashboard";

export default async function PortalDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientToken: string }>;
}) {
  const { clientToken } = await params;

  // Verify client exists
  const client = await db.client.findUnique({
    where: { portalToken: clientToken },
    select: {
      id: true,
      name: true,
      portalPassphraseHash: true,
      organization: {
        select: {
          name: true,
          logoUrl: true,
          brandColor: true,
        },
      },
    },
  });

  if (!client) {
    redirect("/");
  }

  // Check session cookie
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(`portal_dashboard_${clientToken}`)?.value;

  if (!sessionToken) {
    redirect(`/portal/dashboard/${clientToken}/login`);
  }

  // Validate session in DB
  const session = await db.clientPortalSession.findFirst({
    where: { token: sessionToken, clientId: client.id },
  });

  if (!session || isSessionExpired(session.expiresAt)) {
    redirect(`/portal/dashboard/${clientToken}/login`);
  }

  const brandColor = client.organization.brandColor ?? "#2563eb";

  return (
    <div className="min-h-screen bg-background">
      {/* Dashboard header */}
      <header
        className="border-b border-border/50"
        style={{ backgroundColor: brandColor }}
      >
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {client.organization.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={client.organization.logoUrl}
                alt={client.organization.name}
                className="h-8 w-auto max-w-[120px] object-contain"
              />
            )}
            <div>
              <h1 className="text-lg font-bold text-white">
                {client.organization.name}
              </h1>
              <p className="text-white/70 text-xs">
                Client Portal &middot; {client.name}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
```

#### Step 2: Create login page

Create `src/app/portal/dashboard/[clientToken]/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PortalDashboardLoginPage() {
  const params = useParams<{ clientToken: string }>();
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/portal/dashboard/${params.clientToken}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });

      if (res.ok) {
        router.push(`/portal/dashboard/${params.clientToken}`);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Incorrect passphrase. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-card p-8">
        <h1 className="text-xl font-bold text-foreground mb-2">Client Portal</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Enter your passphrase to access your dashboard.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="passphrase">Passphrase</Label>
            <Input
              id="passphrase"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter passphrase"
              autoFocus
              required
            />
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Verifying..." : "Access Dashboard"}
          </Button>
        </form>
      </div>
    </div>
  );
}
```

#### Step 3: Create auth API route

Create `src/app/api/portal/dashboard/[clientToken]/auth/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { generateSessionToken, SESSION_DURATION_MS } from "@/server/services/portal-dashboard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientToken: string }> }
) {
  const { clientToken } = await params;
  const body = await req.json() as { passphrase?: string };
  const passphrase = body.passphrase?.trim() ?? "";

  const client = await db.client.findUnique({
    where: { portalToken: clientToken },
    select: { id: true, portalPassphraseHash: true },
  });

  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // If passphrase is set, verify it
  if (client.portalPassphraseHash) {
    const match = await bcrypt.compare(passphrase, client.portalPassphraseHash);
    if (!match) {
      return NextResponse.json({ error: "Incorrect passphrase" }, { status: 401 });
    }
  }

  // Create session
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.clientPortalSession.create({
    data: {
      token,
      clientId: client.id,
      expiresAt,
      ipAddress: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
  });

  // Set session cookie
  const cookieStore = await cookies();
  cookieStore.set(`portal_dashboard_${clientToken}`, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: `/portal/dashboard/${clientToken}`,
  });

  return NextResponse.json({ ok: true });
}
```

#### Step 4: Create loading skeleton

Create `src/app/portal/dashboard/[clientToken]/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Summary cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      {/* Invoice table skeleton */}
      <Skeleton className="h-64 rounded-2xl" />
      {/* Projects skeleton */}
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}
```

#### Step 5: Commit

```bash
git add src/app/portal/dashboard/ src/app/api/portal/dashboard/
git commit -m "$(cat <<'EOF'
feat(B1.3): add portal dashboard page layout, login, and auth route

Create client portal dashboard route structure with session-based
auth, login page, loading skeleton, and API auth endpoint that
creates ClientPortalSession records with cookie management.
EOF
)"
```

---

### Task B1.4: Summary Cards Component

**Files:**
- Create: `src/components/portal/DashboardSummaryCards.tsx`

#### Step 1: Create summary cards

Create `src/components/portal/DashboardSummaryCards.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { DollarSign, AlertTriangle, FileText } from "lucide-react";

type Props = {
  outstanding: number;
  overdue: number;
  totalInvoices: number;
  currencySymbol: string;
};

function fmt(n: number, symbol: string): string {
  return `${symbol}${n.toFixed(2)}`;
}

const cards = [
  {
    key: "outstanding",
    label: "Outstanding",
    icon: DollarSign,
    color: "text-amber-600",
    bg: "bg-amber-50",
    format: (v: number, sym: string) => fmt(v, sym),
  },
  {
    key: "overdue",
    label: "Overdue",
    icon: AlertTriangle,
    color: "text-red-600",
    bg: "bg-red-50",
    format: (v: number, sym: string) => fmt(v, sym),
  },
  {
    key: "totalInvoices",
    label: "Total Invoices",
    icon: FileText,
    color: "text-blue-600",
    bg: "bg-blue-50",
    format: (v: number) => String(v),
  },
] as const;

export function DashboardSummaryCards({ outstanding, overdue, totalInvoices, currencySymbol }: Props) {
  const values = { outstanding, overdue, totalInvoices };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const val = values[card.key];
        return (
          <div
            key={card.key}
            className="rounded-2xl border border-border/50 bg-card p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={cn("rounded-lg p-2", card.bg)}>
                <Icon className={cn("h-4 w-4", card.color)} />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {card.label}
              </p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {card.format(val, currencySymbol)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
```

#### Step 2: Commit

```bash
git add src/components/portal/DashboardSummaryCards.tsx
git commit -m "$(cat <<'EOF'
feat(B1.4): add portal dashboard summary cards component

Shows outstanding balance, overdue amount, and total invoices
in a responsive 3-column card grid with icons and formatting.
EOF
)"
```

---

### Task B1.5: Invoice Table with Status Filter

**Files:**
- Create: `src/components/portal/DashboardInvoiceTable.tsx`

#### Step 1: Create invoice table with filters

Create `src/components/portal/DashboardInvoiceTable.tsx`:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { InvoiceStatus } from "@/generated/prisma";
import { ExternalLink } from "lucide-react";

type InvoiceRow = {
  id: string;
  number: string;
  status: InvoiceStatus;
  date: string | Date;
  dueDate: string | Date | null;
  total: number;
  amountPaid: number;
  portalToken: string;
  currency: { symbol: string; symbolPosition: string };
};

type Props = {
  invoices: InvoiceRow[];
};

const STATUS_BADGE: Record<string, { label: string; className: string; dot: string }> = {
  DRAFT:          { label: "Draft",    className: "bg-gray-100 text-gray-500",      dot: "bg-gray-400" },
  SENT:           { label: "Unpaid",   className: "bg-amber-50 text-amber-600",     dot: "bg-amber-500" },
  PARTIALLY_PAID: { label: "Partial",  className: "bg-blue-50 text-blue-600",       dot: "bg-blue-500" },
  PAID:           { label: "Paid",     className: "bg-emerald-50 text-emerald-600", dot: "bg-emerald-500" },
  OVERDUE:        { label: "Overdue",  className: "bg-red-50 text-red-600",         dot: "bg-red-500" },
  ACCEPTED:       { label: "Accepted", className: "bg-primary/10 text-primary",     dot: "bg-primary" },
  REJECTED:       { label: "Rejected", className: "bg-gray-100 text-gray-400",      dot: "bg-gray-300" },
};

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "UNPAID", label: "Unpaid" },
  { key: "PAID", label: "Paid" },
  { key: "OVERDUE", label: "Overdue" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function matchesFilter(status: string, filter: FilterKey): boolean {
  if (filter === "ALL") return true;
  if (filter === "UNPAID") return ["SENT", "PARTIALLY_PAID"].includes(status);
  if (filter === "PAID") return status === "PAID";
  if (filter === "OVERDUE") return status === "OVERDUE";
  return true;
}

function formatDate(d: string | Date | null): string {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmt(n: number, symbol: string, pos: string): string {
  return pos === "before" ? `${symbol}${n.toFixed(2)}` : `${n.toFixed(2)}${symbol}`;
}

export function DashboardInvoiceTable({ invoices }: Props) {
  const [filter, setFilter] = useState<FilterKey>("ALL");

  const filtered = invoices.filter((inv) => matchesFilter(inv.status, filter));

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-semibold text-foreground">Invoices</h2>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter(f.key)}
              className="text-xs"
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No invoices found.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <table className="w-full text-sm hidden sm:table">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-6 py-3 font-semibold">Invoice</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold">Date</th>
                <th className="px-6 py-3 font-semibold">Due</th>
                <th className="px-6 py-3 text-right font-semibold">Total</th>
                <th className="px-6 py-3 text-right font-semibold">Balance</th>
                <th className="px-6 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const badge = STATUS_BADGE[inv.status] ?? STATUS_BADGE.DRAFT;
                const balance = inv.total - inv.amountPaid;
                const f = (n: number) => fmt(n, inv.currency.symbol, inv.currency.symbolPosition);
                return (
                  <tr key={inv.id} className="border-b border-border/50 last:border-0">
                    <td className="px-6 py-3.5 font-medium text-foreground">
                      #{inv.number}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium", badge.className)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", badge.dot)} />
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-muted-foreground">{formatDate(inv.date)}</td>
                    <td className="px-6 py-3.5 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                    <td className="px-6 py-3.5 text-right font-medium text-foreground">{f(inv.total)}</td>
                    <td className="px-6 py-3.5 text-right font-medium text-foreground">
                      {balance > 0 ? f(balance) : "\u2014"}
                    </td>
                    <td className="px-6 py-3.5">
                      <a
                        href={`/portal/${inv.portalToken}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-border/50">
            {filtered.map((inv) => {
              const badge = STATUS_BADGE[inv.status] ?? STATUS_BADGE.DRAFT;
              const balance = inv.total - inv.amountPaid;
              const f = (n: number) => fmt(n, inv.currency.symbol, inv.currency.symbolPosition);
              return (
                <a
                  key={inv.id}
                  href={`/portal/${inv.portalToken}`}
                  className="block p-4 hover:bg-accent/30"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-medium text-foreground">#{inv.number}</span>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-medium", badge.className)}>
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", badge.dot)} />
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatDate(inv.date)}</span>
                    <span className="font-medium text-foreground">{f(inv.total)}</span>
                  </div>
                  {balance > 0 && (
                    <p className="text-xs text-red-600 mt-1">Balance: {f(balance)}</p>
                  )}
                </a>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
```

#### Step 2: Commit

```bash
git add src/components/portal/DashboardInvoiceTable.tsx
git commit -m "$(cat <<'EOF'
feat(B1.5): add portal dashboard invoice table with status filter

Filterable invoice table showing number, status, dates, total, and
balance with responsive mobile card layout. Includes All/Unpaid/Paid/
Overdue filter buttons.
EOF
)"
```

---

### Task B1.6: Payment History & Active Projects Sections

**Files:**
- Create: `src/components/portal/DashboardPaymentHistory.tsx`
- Create: `src/components/portal/DashboardProjects.tsx`

#### Step 1: Create payment history component

Create `src/components/portal/DashboardPaymentHistory.tsx`:

```tsx
type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  paidAt: string | Date;
  invoiceNumber: string;
  currencySymbol: string;
};

type Props = {
  payments: PaymentRow[];
};

function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function DashboardPaymentHistory({ payments }: Props) {
  if (payments.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50">
        <h2 className="text-base font-semibold text-foreground">Recent Payments</h2>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-6 py-3 font-semibold">Date</th>
            <th className="px-6 py-3 font-semibold">Invoice</th>
            <th className="px-6 py-3 font-semibold">Method</th>
            <th className="px-6 py-3 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-b border-border/50 last:border-0">
              <td className="px-6 py-3.5 text-muted-foreground">{formatDate(p.paidAt)}</td>
              <td className="px-6 py-3.5 font-medium text-foreground">#{p.invoiceNumber}</td>
              <td className="px-6 py-3.5 capitalize text-muted-foreground">{p.method}</td>
              <td className="px-6 py-3.5 text-right font-medium text-foreground">
                {p.currencySymbol}{p.amount.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

#### Step 2: Create active projects component

Create `src/components/portal/DashboardProjects.tsx`:

```tsx
import { FolderOpen, Calendar } from "lucide-react";

type ProjectRow = {
  id: string;
  name: string;
  status: string;
  dueDate: string | Date | null;
  projectedHours: number;
};

type Props = {
  projects: ProjectRow[];
};

function formatDate(d: string | Date | null): string {
  if (!d) return "No due date";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function DashboardProjects({ projects }: Props) {
  if (projects.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50">
        <h2 className="text-base font-semibold text-foreground">Active Projects</h2>
      </div>

      <div className="divide-y divide-border/50">
        {projects.map((proj) => (
          <div key={proj.id} className="px-6 py-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2">
              <FolderOpen className="h-4 w-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{proj.name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <Calendar className="h-3 w-3" />
                <span>{formatDate(proj.dueDate)}</span>
                {proj.projectedHours > 0 && (
                  <span>&middot; {proj.projectedHours}h projected</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### Step 3: Commit

```bash
git add src/components/portal/DashboardPaymentHistory.tsx src/components/portal/DashboardProjects.tsx
git commit -m "$(cat <<'EOF'
feat(B1.6): add payment history and active projects dashboard components

DashboardPaymentHistory shows recent payments with date, invoice
number, method, and amount. DashboardProjects lists active client-
visible projects with due dates and projected hours.
EOF
)"
```

---

### Task B1.7: Statement Download (PDF)

**Files:**
- Create: `src/app/api/portal/dashboard/[clientToken]/statement/route.ts`
- Modify: `src/app/portal/dashboard/[clientToken]/page.tsx` (finalize the dashboard page)

#### Step 1: Create portal statement API route

Create `src/app/api/portal/dashboard/[clientToken]/statement/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { cookies } from "next/headers";
import { isSessionExpired } from "@/server/services/portal-dashboard";
import type { StatementData } from "@/server/services/client-statement-pdf";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientToken: string }> }
) {
  const { clientToken } = await params;

  // Verify client
  const client = await db.client.findUnique({
    where: { portalToken: clientToken },
    select: { id: true, name: true, email: true, organizationId: true },
  });
  if (!client) {
    return new Response("Not Found", { status: 404 });
  }

  // Verify session
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(`portal_dashboard_${clientToken}`)?.value;
  if (!sessionToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const session = await db.clientPortalSession.findFirst({
    where: { token: sessionToken, clientId: client.id },
  });
  if (!session || isSessionExpired(session.expiresAt)) {
    return new Response("Session expired", { status: 401 });
  }

  // Fetch organization
  const organization = await db.organization.findUnique({
    where: { id: client.organizationId },
  });
  if (!organization) {
    return new Response("Not Found", { status: 404 });
  }

  // Parse optional date range
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;

  // Fetch invoices with payments
  const invoices = await db.invoice.findMany({
    where: {
      clientId: client.id,
      organizationId: client.organizationId,
      isArchived: false,
      ...(from || to ? {
        date: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      } : {}),
    },
    include: {
      currency: true,
      payments: { select: { amount: true } },
      partialPayments: { select: { amount: true } },
    },
    orderBy: { date: "asc" },
  });

  const statementInvoices: StatementData["invoices"] = invoices.map((inv) => {
    const amountPaid =
      inv.payments.reduce((s, p) => s + Number(p.amount), 0) +
      inv.partialPayments.reduce((s, p) => s + Number(p.amount), 0);
    return {
      id: inv.id,
      number: inv.number,
      type: inv.type,
      status: inv.status,
      date: inv.date,
      dueDate: inv.dueDate,
      total: inv.total,
      currency: inv.currency,
      amountPaid,
    };
  });

  const { generateClientStatementPDF } = await import(
    "@/server/services/client-statement-pdf"
  );

  const pdf = await generateClientStatementPDF({
    client,
    organization,
    invoices: statementInvoices,
    from,
    to,
  });

  const safeName = client.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const date = new Date().toISOString().split("T")[0];

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="statement-${safeName}-${date}.pdf"`,
    },
  });
}
```

#### Step 2: Create the dashboard page assembling all components

Create `src/app/portal/dashboard/[clientToken]/page.tsx`:

```tsx
import { db } from "@/server/db";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { isSessionExpired } from "@/server/services/portal-dashboard";
import { DashboardSummaryCards } from "@/components/portal/DashboardSummaryCards";
import { DashboardInvoiceTable } from "@/components/portal/DashboardInvoiceTable";
import { DashboardPaymentHistory } from "@/components/portal/DashboardPaymentHistory";
import { DashboardProjects } from "@/components/portal/DashboardProjects";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default async function PortalDashboardPage({
  params,
}: {
  params: Promise<{ clientToken: string }>;
}) {
  const { clientToken } = await params;

  // Resolve session
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(`portal_dashboard_${clientToken}`)?.value;
  if (!sessionToken) notFound();

  const session = await db.clientPortalSession.findFirst({
    where: { token: sessionToken },
    select: { clientId: true, expiresAt: true },
  });
  if (!session || isSessionExpired(session.expiresAt)) notFound();

  const client = await db.client.findUnique({
    where: { id: session.clientId },
    select: {
      id: true,
      name: true,
      email: true,
      organizationId: true,
      portalToken: true,
    },
  });
  if (!client) notFound();

  // Fetch invoices
  const invoices = await db.invoice.findMany({
    where: {
      clientId: client.id,
      organizationId: client.organizationId,
      isArchived: false,
    },
    include: {
      currency: { select: { symbol: true, symbolPosition: true, code: true } },
      payments: { select: { amount: true, paidAt: true, method: true, id: true } },
    },
    orderBy: { date: "desc" },
  });

  // Fetch active projects
  const projects = await db.project.findMany({
    where: {
      clientId: client.id,
      organizationId: client.organizationId,
      isViewable: true,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      status: true,
      dueDate: true,
      projectedHours: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Compute summary
  const PAYABLE = ["SENT", "PARTIALLY_PAID", "OVERDUE"];
  const outstanding = invoices
    .filter((inv) => PAYABLE.includes(inv.status))
    .reduce((sum, inv) => {
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
      return sum + Number(inv.total) - paid;
    }, 0);

  const overdue = invoices
    .filter((inv) => inv.status === "OVERDUE")
    .reduce((sum, inv) => {
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
      return sum + Number(inv.total) - paid;
    }, 0);

  // Gather recent payments across all invoices
  const recentPayments = invoices
    .flatMap((inv) =>
      inv.payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        method: p.method,
        paidAt: p.paidAt.toISOString(),
        invoiceNumber: inv.number,
        currencySymbol: inv.currency.symbol,
      }))
    )
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
    .slice(0, 20);

  // Determine currency symbol (from first invoice or default)
  const currencySymbol = invoices[0]?.currency.symbol ?? "$";

  return (
    <div className="space-y-6">
      {/* Welcome + statement download */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            Welcome, {client.name}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            View your invoices, payments, and projects in one place.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/portal/dashboard/${clientToken}/statement`} download>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download Statement
          </a>
        </Button>
      </div>

      {/* Summary cards */}
      <DashboardSummaryCards
        outstanding={outstanding}
        overdue={overdue}
        totalInvoices={invoices.length}
        currencySymbol={currencySymbol}
      />

      {/* Invoice table */}
      <DashboardInvoiceTable
        invoices={invoices.map((inv) => ({
          id: inv.id,
          number: inv.number,
          status: inv.status,
          date: inv.date.toISOString(),
          dueDate: inv.dueDate?.toISOString() ?? null,
          total: Number(inv.total),
          amountPaid: inv.payments.reduce((s, p) => s + Number(p.amount), 0),
          portalToken: inv.portalToken,
          currency: inv.currency,
        }))}
      />

      {/* Two-column: payments + projects */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DashboardPaymentHistory payments={recentPayments} />
        <DashboardProjects
          projects={projects.map((p) => ({
            ...p,
            dueDate: p.dueDate?.toISOString() ?? null,
          }))}
        />
      </div>
    </div>
  );
}
```

#### Step 3: Commit

```bash
git add src/app/portal/dashboard/ src/app/api/portal/dashboard/ src/components/portal/
git commit -m "$(cat <<'EOF'
feat(B1.7): complete portal dashboard page with statement download

Assemble the client portal dashboard page with summary cards, invoice
table, payment history, active projects, and PDF statement download
via a session-authenticated API route.
EOF
)"
```

---

## B2: E-Signatures on Proposals / Estimates

### Task B2.1: Prisma Schema - Signature Fields & Audit Log

**Files:**
- Modify: `prisma/schema.prisma`
- Run migration: `npx prisma migrate dev --name add-signature-fields`

#### Step 1: Add signature fields to Invoice model

In `prisma/schema.prisma`, add the following fields to the `Invoice` model after line 316 (`portalToken String @unique @default(cuid())`):

```prisma
  // E-signature fields (for proposals/estimates)
  signedAt       DateTime?
  signedByName   String?
  signedByEmail  String?
  signedByIp     String?
  signatureData  String?   // Encrypted base64 PNG or SVG path data
```

#### Step 2: Add SignatureAuditLog model

Add after the `AuditLog` model (after line 780):

```prisma
model SignatureAuditLog {
  id              String   @id @default(cuid())
  invoiceId       String
  invoice         Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  organizationId  String
  signedByName    String
  signedByEmail   String
  signedByIp      String
  userAgent       String?
  documentHash    String   // SHA-256 hash of proposal content at time of signing
  signatureHash   String   // SHA-256 hash of signature data

  createdAt       DateTime @default(now())

  @@index([invoiceId])
  @@index([organizationId])
}
```

Add the relation to Invoice model, after the `proposalContent` line:

```prisma
  signatureAuditLogs  SignatureAuditLog[]
```

#### Step 3: Run migration

```bash
npx prisma migrate dev --name add-signature-fields
```

#### Step 4: Update mock Prisma client

Add to `src/test/mocks/prisma.ts`:

```typescript
    signatureAuditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
```

#### Step 5: Commit

```bash
git add prisma/schema.prisma src/test/mocks/prisma.ts
git commit -m "$(cat <<'EOF'
feat(B2.1): add signature fields to Invoice and SignatureAuditLog model

Add signedAt, signedByName, signedByEmail, signedByIp, signatureData
to Invoice for e-signature support. Add immutable SignatureAuditLog
model tracking document hash, signature hash, IP, and user agent.
EOF
)"
```

---

### Task B2.2: Signature Helpers & Encryption

**Files:**
- Create: `src/server/services/signature.ts`
- Test: `src/test/signature-helpers.test.ts` (new)

#### Step 1: Write failing tests

Create `src/test/signature-helpers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  hashDocument,
  hashSignature,
  validateSignatureData,
  SIGNATURE_MAX_LENGTH,
} from "@/server/services/signature";

describe("Signature Helpers", () => {
  describe("hashDocument", () => {
    it("produces a consistent SHA-256 hex hash", () => {
      const sections = [{ key: "scope", title: "Scope", content: "Build a website" }];
      const hash1 = hashDocument(sections);
      const hash2 = hashDocument(sections);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces different hashes for different content", () => {
      const a = [{ key: "scope", title: "Scope", content: "Build a website" }];
      const b = [{ key: "scope", title: "Scope", content: "Build an app" }];
      expect(hashDocument(a)).not.toBe(hashDocument(b));
    });
  });

  describe("hashSignature", () => {
    it("produces a 64-char hex hash for base64 data", () => {
      const data = "data:image/png;base64,iVBORw0KGgo=";
      const hash = hashSignature(data);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("validateSignatureData", () => {
    it("accepts valid base64 PNG data URL", () => {
      const data = "data:image/png;base64,iVBORw0KGgo=";
      expect(validateSignatureData(data)).toBe(true);
    });

    it("accepts valid SVG path data", () => {
      const data = "M 10 10 L 20 20 L 30 10";
      expect(validateSignatureData(data)).toBe(true);
    });

    it("rejects empty string", () => {
      expect(validateSignatureData("")).toBe(false);
    });

    it("rejects data exceeding max length", () => {
      const data = "x".repeat(SIGNATURE_MAX_LENGTH + 1);
      expect(validateSignatureData(data)).toBe(false);
    });
  });
});
```

**Run:** `npx vitest run src/test/signature-helpers.test.ts`
**Expected:** FAIL (module not found)

#### Step 2: Implement signature helpers

Create `src/server/services/signature.ts`:

```typescript
import { createHash } from "crypto";
import { encryptJson, decryptJson } from "./encryption";

/** Maximum signature data length (500KB base64) */
export const SIGNATURE_MAX_LENGTH = 500_000;

/**
 * Hash proposal sections to create an immutable document fingerprint.
 * Uses SHA-256 for tamper detection.
 */
export function hashDocument(sections: Array<{ key: string; title: string; content: string }>): string {
  const canonical = JSON.stringify(
    sections.map((s) => ({ key: s.key, title: s.title, content: s.content }))
  );
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Hash signature data (base64 PNG or SVG path) for audit purposes.
 */
export function hashSignature(signatureData: string): string {
  return createHash("sha256").update(signatureData).digest("hex");
}

/**
 * Validate signature data format and size.
 */
export function validateSignatureData(data: string): boolean {
  if (!data || data.length === 0) return false;
  if (data.length > SIGNATURE_MAX_LENGTH) return false;

  // Accept base64 data URLs (PNG/JPEG) or SVG path data
  const isDataUrl = /^data:image\/(png|jpeg|svg\+xml);base64,/.test(data);
  const isSvgPath = /^[MLCQSTAZHVmlcqstahvz0-9\s.,\-]+$/.test(data);

  return isDataUrl || isSvgPath;
}

/**
 * Encrypt signature data for storage using the existing AES-256-GCM encryption.
 */
export function encryptSignature(signatureData: string): string {
  return encryptJson({ data: signatureData });
}

/**
 * Decrypt stored signature data.
 */
export function decryptSignature(encrypted: string): string {
  const result = decryptJson<{ data: string }>(encrypted);
  return result.data;
}
```

**Run:** `npx vitest run src/test/signature-helpers.test.ts`
**Expected:** PASS (6 tests)

#### Step 3: Commit

```bash
git add src/server/services/signature.ts src/test/signature-helpers.test.ts
git commit -m "$(cat <<'EOF'
feat(B2.2): add signature helper functions with encryption

Add hashDocument (SHA-256 of proposal sections), hashSignature,
validateSignatureData (base64 PNG/SVG path validation), and
encrypt/decrypt wrappers reusing existing AES-256-GCM pattern.
EOF
)"
```

---

### Task B2.3: Portal Signature tRPC Procedure

**Files:**
- Modify: `src/server/routers/portal.ts`
- Test: `src/test/portal-signature-procedures.test.ts` (new)

#### Step 1: Write failing tests

Create `src/test/portal-signature-procedures.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { portalRouter } from "@/server/routers/portal";
import { createMockContext } from "./mocks/trpc-context";
import { TRPCError } from "@trpc/server";

// Mock the signature module
vi.mock("@/server/services/signature", () => ({
  validateSignatureData: vi.fn().mockReturnValue(true),
  hashDocument: vi.fn().mockReturnValue("abc123hash"),
  hashSignature: vi.fn().mockReturnValue("sig456hash"),
  encryptSignature: vi.fn().mockReturnValue("encrypted-sig-data"),
  SIGNATURE_MAX_LENGTH: 500000,
}));

// Mock resend
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: "email_1" }) },
  })),
}));

describe("Portal Signature Procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    ctx.orgId = undefined;
    ctx.userId = undefined;
    caller = portalRouter.createCaller(ctx);
  });

  describe("signProposal", () => {
    it("signs a proposal and creates audit log", async () => {
      const mockInvoice = {
        id: "inv_1",
        number: "EST-001",
        type: "ESTIMATE",
        status: "SENT",
        organizationId: "org_1",
        portalToken: "tok_1",
        client: { name: "Client", email: "client@test.com" },
        proposalContent: {
          id: "prop_1",
          sections: [{ key: "scope", title: "Scope", content: "Build it" }],
        },
        organization: {
          name: "My Org",
          logoUrl: null,
          users: [{ email: "admin@test.com", role: "ADMIN" }],
        },
      };

      ctx.db.invoice.findUnique.mockResolvedValue(mockInvoice);
      ctx.db.invoice.update.mockResolvedValue({
        ...mockInvoice,
        status: "ACCEPTED",
        signedAt: new Date(),
      });
      ctx.db.signatureAuditLog.create.mockResolvedValue({ id: "audit_1" });

      const result = await caller.signProposal({
        token: "tok_1",
        signedByName: "John Doe",
        signedByEmail: "john@test.com",
        signatureData: "data:image/png;base64,iVBORw0KGgo=",
        legalConsent: true,
      });

      expect(result.status).toBe("ACCEPTED");
      expect(ctx.db.invoice.update).toHaveBeenCalled();
      expect(ctx.db.signatureAuditLog.create).toHaveBeenCalled();
    });

    it("rejects if already signed", async () => {
      ctx.db.invoice.findUnique.mockResolvedValue({
        id: "inv_1",
        type: "ESTIMATE",
        status: "ACCEPTED",
        signedAt: new Date(),
        organizationId: "org_1",
        proposalContent: { id: "prop_1", sections: [] },
      });

      await expect(
        caller.signProposal({
          token: "tok_1",
          signedByName: "John",
          signedByEmail: "john@test.com",
          signatureData: "data:image/png;base64,abc=",
          legalConsent: true,
        })
      ).rejects.toThrow(TRPCError);
    });

    it("rejects without legal consent", async () => {
      await expect(
        caller.signProposal({
          token: "tok_1",
          signedByName: "John",
          signedByEmail: "john@test.com",
          signatureData: "data:image/png;base64,abc=",
          legalConsent: false,
        })
      ).rejects.toThrow();
    });
  });
});
```

**Run:** `npx vitest run src/test/portal-signature-procedures.test.ts`
**Expected:** FAIL (procedure doesn't exist)

#### Step 2: Implement the signProposal procedure

Add to `src/server/routers/portal.ts` inside the `portalRouter`:

```typescript
  signProposal: publicProcedure
    .input(
      z.object({
        token: z.string(),
        signedByName: z.string().min(1).max(200),
        signedByEmail: z.string().email(),
        signatureData: z.string().min(1),
        legalConsent: z.literal(true, {
          errorMap: () => ({ message: "Legal consent is required" }),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { validateSignatureData, hashDocument, hashSignature, encryptSignature } =
        await import("../services/signature");

      if (!validateSignatureData(input.signatureData)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid signature data" });
      }

      const invoice = await ctx.db.invoice.findUnique({
        where: { portalToken: input.token },
        include: {
          client: { select: { name: true, email: true } },
          proposalContent: { select: { id: true, sections: true } },
          organization: {
            select: {
              name: true,
              logoUrl: true,
              users: { select: { email: true, role: true } },
            },
          },
        },
      });

      if (!invoice || invoice.type !== "ESTIMATE") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (invoice.signedAt || invoice.status === "ACCEPTED" || invoice.status === "REJECTED") {
        throw new TRPCError({ code: "CONFLICT", message: "Proposal already signed or finalized" });
      }

      if (!invoice.proposalContent) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No proposal content found" });
      }

      const sections = invoice.proposalContent.sections as Array<{
        key: string;
        title: string;
        content: string;
      }>;

      const docHash = hashDocument(sections);
      const sigHash = hashSignature(input.signatureData);
      const encryptedSig = encryptSignature(input.signatureData);

      // Update invoice with signature
      const updated = await ctx.db.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "ACCEPTED",
          signedAt: new Date(),
          signedByName: input.signedByName,
          signedByEmail: input.signedByEmail,
          signedByIp: "unknown", // Will be set via header in API wrapper if needed
          signatureData: encryptedSig,
        },
      });

      // Create immutable audit log
      await ctx.db.signatureAuditLog.create({
        data: {
          invoiceId: invoice.id,
          organizationId: invoice.organizationId,
          signedByName: input.signedByName,
          signedByEmail: input.signedByEmail,
          signedByIp: "unknown",
          documentHash: docHash,
          signatureHash: sigHash,
        },
      });

      // Notify org admins (fire-and-forget)
      try {
        const { notifyOrgAdmins } = await import("@/server/services/notifications");
        await notifyOrgAdmins(invoice.organizationId, {
          type: "ESTIMATE_ACCEPTED",
          title: `Proposal signed: Estimate #${invoice.number}`,
          body: `${input.signedByName} (${input.signedByEmail}) signed the proposal`,
          link: `/invoices/${invoice.id}`,
        });
      } catch {
        // Non-fatal
      }

      return { status: updated.status, signedAt: updated.signedAt };
    }),
```

**Run:** `npx vitest run src/test/portal-signature-procedures.test.ts`
**Expected:** PASS (3 tests)

#### Step 3: Commit

```bash
git add src/server/routers/portal.ts src/test/portal-signature-procedures.test.ts
git commit -m "$(cat <<'EOF'
feat(B2.3): add signProposal tRPC procedure with audit logging

Public procedure that captures e-signature, validates data, encrypts
signature, updates invoice to ACCEPTED, and creates immutable
SignatureAuditLog with document and signature hashes.
EOF
)"
```

---

### Task B2.4: Signature Capture Widget (Canvas + Type)

**Files:**
- Create: `src/components/portal/SignatureCapture.tsx`

#### Step 1: Create signature widget

Create `src/components/portal/SignatureCapture.tsx`:

```tsx
"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eraser, Pen, Type } from "lucide-react";

type Mode = "draw" | "type";

type Props = {
  onCapture: (dataUrl: string) => void;
  disabled?: boolean;
};

export function SignatureCapture({ onCapture, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("draw");
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [typedName, setTypedName] = useState("");

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0f1628";
  }, []);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  }, [disabled, getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  }, [isDrawing, disabled, getPos]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }, []);

  const captureSignature = useCallback(() => {
    if (mode === "draw") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL("image/png");
      onCapture(dataUrl);
    } else {
      // Type mode: render text on canvas and export
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 150;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 600, 150);
      ctx.font = "italic 48px 'Georgia', 'Times New Roman', serif";
      ctx.fillStyle = "#0f1628";
      ctx.textBaseline = "middle";
      ctx.fillText(typedName, 20, 75);
      onCapture(canvas.toDataURL("image/png"));
    }
  }, [mode, typedName, onCapture]);

  const canSubmit = mode === "draw" ? hasDrawn : typedName.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === "draw" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("draw")}
          disabled={disabled}
        >
          <Pen className="h-3.5 w-3.5 mr-1.5" />
          Draw
        </Button>
        <Button
          type="button"
          variant={mode === "type" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("type")}
          disabled={disabled}
        >
          <Type className="h-3.5 w-3.5 mr-1.5" />
          Type
        </Button>
      </div>

      {mode === "draw" ? (
        <div className="space-y-2">
          <div className="relative rounded-xl border-2 border-dashed border-border bg-white">
            <canvas
              ref={canvasRef}
              className="w-full h-32 cursor-crosshair touch-none"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            {!hasDrawn && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none">
                Sign here
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearCanvas}
            disabled={!hasDrawn || disabled}
          >
            <Eraser className="h-3.5 w-3.5 mr-1.5" />
            Clear
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="typed-signature">Type your full name</Label>
          <Input
            id="typed-signature"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="John Doe"
            className="text-2xl font-serif italic h-14"
            disabled={disabled}
          />
          {typedName && (
            <div className="rounded-xl border border-border bg-white p-4">
              <p className="text-3xl font-serif italic text-foreground">
                {typedName}
              </p>
            </div>
          )}
        </div>
      )}

      <Button
        type="button"
        onClick={captureSignature}
        disabled={!canSubmit || disabled}
        className="w-full"
      >
        Apply Signature
      </Button>
    </div>
  );
}
```

#### Step 2: Commit

```bash
git add src/components/portal/SignatureCapture.tsx
git commit -m "$(cat <<'EOF'
feat(B2.4): add signature capture widget with draw and type modes

Canvas-based draw mode with touch support and typed signature mode
using serif font rendering. Exports as base64 PNG data URL. Includes
clear/redo functionality and responsive mobile layout.
EOF
)"
```

---

### Task B2.5: Portal Proposal View with Signature

**Files:**
- Create: `src/components/portal/ProposalSignatureForm.tsx`
- Modify: `src/app/portal/[token]/page.tsx` (add signature section for unsigned proposals)

#### Step 1: Create the signature form wrapper

Create `src/components/portal/ProposalSignatureForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { SignatureCapture } from "./SignatureCapture";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle } from "lucide-react";

type Props = {
  token: string;
  invoiceNumber: string;
};

export function ProposalSignatureForm({ token, invoiceNumber }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState("");

  const signMutation = trpc.portal.signProposal.useMutation({
    onSuccess: () => {
      setSigned(true);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = () => {
    if (!signatureData || !name || !email || !consent) return;
    setError("");
    signMutation.mutate({
      token,
      signedByName: name,
      signedByEmail: email,
      signatureData,
      legalConsent: true,
    });
  };

  if (signed) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle className="h-8 w-8 text-emerald-600 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-emerald-700 mb-1">
          Proposal Signed
        </h3>
        <p className="text-sm text-emerald-600">
          Thank you for signing estimate #{invoiceNumber}. A confirmation has been sent.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">
          Sign This Proposal
        </h2>
        <p className="text-sm text-muted-foreground">
          Review the proposal above, then sign below to accept estimate #{invoiceNumber}.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sig-name">Full Name</Label>
          <Input
            id="sig-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Doe"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sig-email">Email</Label>
          <Input
            id="sig-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="john@example.com"
            required
          />
        </div>
      </div>

      <SignatureCapture
        onCapture={setSignatureData}
        disabled={signMutation.isPending}
      />

      {signatureData && (
        <div className="rounded-xl border border-border bg-accent/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Signature Preview
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signatureData}
            alt="Your signature"
            className="h-16 w-auto"
          />
        </div>
      )}

      <div className="flex items-start gap-2">
        <Checkbox
          id="legal-consent"
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
          disabled={signMutation.isPending}
        />
        <label htmlFor="legal-consent" className="text-xs text-muted-foreground leading-snug cursor-pointer">
          I agree that this electronic signature is legally binding and I have reviewed and accept the proposal in its entirety.
        </label>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!name || !email || !signatureData || !consent || signMutation.isPending}
        className="w-full"
      >
        {signMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Signing...
          </>
        ) : (
          "Sign & Accept Proposal"
        )}
      </Button>
    </div>
  );
}
```

#### Step 2: Update portal invoice page to show signature form

In `src/app/portal/[token]/page.tsx`, add to the data query (the `db.invoice.findUnique` include block):

Add `signedAt: true, signedByName: true,` to the select/include for the invoice query. Since it currently uses `include`, these fields are already included automatically.

After the existing `EstimateActions` block (around line 242-249), add:

```tsx
            {/* E-Signature for unsigned proposals */}
            {invoice.type === "ESTIMATE" &&
              invoice.proposalContent &&
              !invoice.signedAt &&
              invoice.status !== "ACCEPTED" &&
              invoice.status !== "REJECTED" && (
                <ProposalSignatureForm
                  token={token}
                  invoiceNumber={invoice.number}
                />
              )}

            {/* Signed indicator */}
            {invoice.signedAt && invoice.signedByName && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-700">
                  Signed by {invoice.signedByName} on{" "}
                  {new Date(invoice.signedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            )}
```

Add the import at the top of the file:
```typescript
import { ProposalSignatureForm } from "@/components/portal/ProposalSignatureForm";
```

#### Step 3: Commit

```bash
git add src/components/portal/ProposalSignatureForm.tsx src/app/portal/\[token\]/page.tsx
git commit -m "$(cat <<'EOF'
feat(B2.5): add proposal signature form to portal invoice view

ProposalSignatureForm collects name, email, signature (draw/type),
legal consent, then calls signProposal mutation. Shows signed status
for already-signed proposals. Integrated into portal invoice page.
EOF
)"
```

---

### Task B2.6: Signed Proposal PDF Generation

**Files:**
- Modify: `src/server/services/proposal-pdf.tsx`

#### Step 1: Add signature block to proposal PDF

In `src/server/services/proposal-pdf.tsx`, add a signature section to the PDF output. The exact implementation depends on the existing PDF library (likely `@react-pdf/renderer` or `jspdf`).

Read the existing file first to determine the PDF library:

The modification adds a signature block at the bottom of the generated proposal PDF when `invoice.signedAt` is set:

```tsx
// Add after the existing proposal sections rendering, before the final page close:

// --- Signature Block ---
if (invoice.signedAt && invoice.signatureData) {
  const { decryptSignature } = await import("./signature");
  const sigDataUrl = decryptSignature(invoice.signatureData);

  // Render signature section
  // (Implementation depends on PDF library - @react-pdf/renderer example below)
  /*
    <View style={{ marginTop: 40, borderTop: "1px solid #e5e7eb", paddingTop: 20 }}>
      <Text style={{ fontSize: 10, color: "#6b7280", marginBottom: 8 }}>
        ELECTRONICALLY SIGNED
      </Text>
      <Image src={sigDataUrl} style={{ width: 200, height: 60 }} />
      <Text style={{ fontSize: 11, fontWeight: "bold", marginTop: 8 }}>
        {invoice.signedByName}
      </Text>
      <Text style={{ fontSize: 9, color: "#6b7280" }}>
        {invoice.signedByEmail}
      </Text>
      <Text style={{ fontSize: 9, color: "#6b7280" }}>
        Signed: {new Date(invoice.signedAt).toLocaleString()} | IP: {invoice.signedByIp}
      </Text>
    </View>
  */
}
```

**Note:** The exact JSX depends on the PDF library already in use. Read `src/server/services/proposal-pdf.tsx` at implementation time to adapt. The key data points to render are:
- Decrypted signature image (base64 PNG)
- `signedByName`, `signedByEmail`
- `signedAt` timestamp
- `signedByIp`

#### Step 2: Commit

```bash
git add src/server/services/proposal-pdf.tsx
git commit -m "$(cat <<'EOF'
feat(B2.6): add signature block to proposal PDF generation

When a proposal has been signed, the PDF now includes a signature
section at the bottom with the signature image, signer name, email,
timestamp, and IP address.
EOF
)"
```

---

### Task B2.7: Signature Notification Email

**Files:**
- Create: `src/emails/ProposalSignedEmail.tsx`
- Modify: `src/server/routers/portal.ts` (enhance signProposal to send email)

#### Step 1: Create email template

Create `src/emails/ProposalSignedEmail.tsx`:

```tsx
import {
  Html, Head, Body, Container, Section, Row, Column,
  Text, Button, Hr, Img, Preview,
} from "@react-email/components";
import React from "react";

type Props = {
  invoiceNumber: string;
  clientName: string;
  signedByName: string;
  signedByEmail: string;
  signedAt: string;
  orgName: string;
  invoiceLink: string;
  proposalPdfLink?: string;
  logoUrl?: string;
};

const ACCENT = "#2563eb";

export function ProposalSignedEmail({
  invoiceNumber,
  clientName,
  signedByName,
  signedByEmail,
  signedAt,
  orgName,
  invoiceLink,
  proposalPdfLink,
  logoUrl,
}: Props) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Proposal signed -- Estimate #{invoiceNumber} accepted by {signedByName}</Preview>
      <Body style={{ backgroundColor: "#f0efe9", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
        <Container style={{ maxWidth: 580, margin: "32px auto", backgroundColor: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb" }}>

          <Section style={{ backgroundColor: "#0f1628", padding: "28px 32px", textAlign: "center" }}>
            {logoUrl ? (
              <Img src={logoUrl} alt={orgName} width={200} height={40} style={{ maxWidth: 200, maxHeight: 40, height: "auto", margin: "0 auto" }} />
            ) : (
              <Text style={{ color: "#ffffff", fontSize: 22, fontWeight: "bold", fontFamily: "Georgia, 'Times New Roman', Times, serif", margin: 0, letterSpacing: "-0.5px" }}>
                {orgName}
              </Text>
            )}
            <Text style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.15em", margin: "8px 0 0", textTransform: "uppercase" }}>
              Proposal Signed
            </Text>
          </Section>

          <Section style={{ backgroundColor: ACCENT, lineHeight: "4px", fontSize: "4px" }}>&nbsp;</Section>

          <Section style={{ padding: "32px 40px" }}>
            <Text style={{ fontSize: 16, color: "#0f1628", fontWeight: "600", margin: "0 0 8px" }}>
              Great news!
            </Text>
            <Text style={{ color: "#4b5563", fontSize: 15, lineHeight: "1.6", margin: "0 0 24px" }}>
              {clientName} has signed and accepted the proposal for estimate <strong>#{invoiceNumber}</strong>.
            </Text>

            <Section style={{ backgroundColor: "#f8f8f7", borderRadius: 8, padding: "20px 24px", margin: "0 0 28px" }}>
              <Row>
                <Column style={{ width: "50%", paddingRight: 12 }}>
                  <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Signed By</Text>
                  <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: "0 0 16px" }}>{signedByName}</Text>
                </Column>
                <Column style={{ width: "50%", paddingLeft: 12 }}>
                  <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Email</Text>
                  <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: "0 0 16px" }}>{signedByEmail}</Text>
                </Column>
              </Row>
              <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Signed At</Text>
              <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: 0 }}>{signedAt}</Text>
            </Section>

            <Button
              href={invoiceLink}
              style={{ backgroundColor: ACCENT, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
            >
              View Estimate
            </Button>

            {proposalPdfLink && (
              <Text style={{ color: "#6b7280", fontSize: 13, marginTop: 16 }}>
                <a href={proposalPdfLink} style={{ color: ACCENT }}>Download signed proposal PDF</a>
              </Text>
            )}
          </Section>

          <Hr style={{ borderColor: "#f3f4f6", margin: 0 }} />
          <Section style={{ padding: "20px 40px", textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
              Sent by {orgName} &middot; Powered by LWD Invoices
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}

export default ProposalSignedEmail;
```

#### Step 2: Enhance signProposal to send email notification

In the signProposal procedure in `src/server/routers/portal.ts`, expand the notification try-catch block to also send an email:

```typescript
      // Notify org admins (fire-and-forget)
      try {
        const { notifyOrgAdmins } = await import("@/server/services/notifications");
        const { Resend } = await import("resend");
        const { render } = await import("@react-email/render");
        const { ProposalSignedEmail } = await import("@/emails/ProposalSignedEmail");
        const { getOwnerBcc } = await import("@/server/services/email-bcc");

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        const invoiceLink = `${appUrl}/invoices/${invoice.id}`;
        const signedAtFormatted = new Date().toLocaleString("en-US", {
          month: "short", day: "numeric", year: "numeric",
          hour: "numeric", minute: "2-digit",
        });

        // In-app notification
        await notifyOrgAdmins(invoice.organizationId, {
          type: "ESTIMATE_ACCEPTED",
          title: `Proposal signed: Estimate #${invoice.number}`,
          body: `${input.signedByName} (${input.signedByEmail}) signed the proposal`,
          link: `/invoices/${invoice.id}`,
        });

        // Email notification
        const adminEmails = invoice.organization.users
          .filter((u) => u.email && u.role === "ADMIN")
          .map((u) => u.email as string);

        if (adminEmails.length > 0) {
          const html = await render(
            ProposalSignedEmail({
              invoiceNumber: invoice.number,
              clientName: invoice.client.name,
              signedByName: input.signedByName,
              signedByEmail: input.signedByEmail,
              signedAt: signedAtFormatted,
              orgName: invoice.organization.name,
              invoiceLink,
              logoUrl: invoice.organization.logoUrl ?? undefined,
            })
          );

          const resend = new Resend(process.env.RESEND_API_KEY);
          const bcc = await getOwnerBcc(invoice.organizationId);
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
            to: adminEmails,
            subject: `Proposal signed: Estimate #${invoice.number} accepted by ${input.signedByName}`,
            html,
            ...(bcc ? { bcc } : {}),
          });
        }
      } catch {
        // Notification failure is non-fatal
      }
```

#### Step 3: Commit

```bash
git add src/emails/ProposalSignedEmail.tsx src/server/routers/portal.ts
git commit -m "$(cat <<'EOF'
feat(B2.7): add proposal signed email notification

ProposalSignedEmail template with signer details, timestamp, and
links. signProposal procedure now sends email to org admins with
BCC to owner when a proposal is signed.
EOF
)"
```

---

## B3: Automated Thank-You / Follow-Up Sequences

### Task B3.1: Prisma Schema - EmailAutomation & EmailAutomationLog

**Files:**
- Modify: `prisma/schema.prisma`
- Run migration: `npx prisma migrate dev --name add-email-automations`

#### Step 1: Add enum and models

Add the following to `prisma/schema.prisma`:

After the existing enums (after `InvitationStatus`, around line 120):

```prisma
enum EmailAutomationTrigger {
  PAYMENT_RECEIVED
  INVOICE_SENT
  INVOICE_VIEWED
  INVOICE_OVERDUE
}
```

Add after the `Notification` model (after line 762):

```prisma
// ─── Email Automations ───────────────────────────────────────────────────────

model EmailAutomation {
  id              String                  @id @default(cuid())
  trigger         EmailAutomationTrigger
  delayDays       Int                     @default(0)
  templateSubject String
  templateBody    String
  enabled         Boolean                 @default(true)

  organizationId  String
  organization    Organization            @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  logs            EmailAutomationLog[]

  createdAt       DateTime                @default(now())
  updatedAt       DateTime                @updatedAt

  @@index([organizationId, trigger])
  @@index([enabled])
}

model EmailAutomationLog {
  id              String          @id @default(cuid())
  automationId    String
  automation      EmailAutomation @relation(fields: [automationId], references: [id], onDelete: Cascade)
  invoiceId       String
  recipientEmail  String
  sentAt          DateTime        @default(now())

  @@index([automationId])
  @@index([invoiceId])
  @@unique([automationId, invoiceId])  // Prevent double-send per automation per invoice
}
```

Add relations to `Organization` model:

```prisma
  emailAutomations    EmailAutomation[]
```

#### Step 2: Run migration

```bash
npx prisma migrate dev --name add-email-automations
```

#### Step 3: Update mock Prisma client

Add to `src/test/mocks/prisma.ts`:

```typescript
    emailAutomation: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    emailAutomationLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
```

#### Step 4: Commit

```bash
git add prisma/schema.prisma src/test/mocks/prisma.ts
git commit -m "$(cat <<'EOF'
feat(B3.1): add EmailAutomation and EmailAutomationLog models

EmailAutomation stores trigger-based email templates with delay
configuration. EmailAutomationLog tracks sent emails with unique
constraint on (automationId, invoiceId) to prevent double-sends.
EOF
)"
```

---

### Task B3.2: Email Automation tRPC Router

**Files:**
- Create: `src/server/routers/emailAutomations.ts`
- Modify: `src/server/routers/_app.ts`
- Test: `src/test/routers-email-automations.test.ts` (new)

#### Step 1: Write failing tests

Create `src/test/routers-email-automations.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { emailAutomationsRouter } from "@/server/routers/emailAutomations";
import { createMockContext } from "./mocks/trpc-context";
import { TRPCError } from "@trpc/server";

describe("Email Automations Router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = emailAutomationsRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns automations for the org", async () => {
      const mockAutomations = [
        {
          id: "auto_1",
          trigger: "PAYMENT_RECEIVED",
          delayDays: 0,
          templateSubject: "Thank you!",
          templateBody: "Thanks {{clientName}}!",
          enabled: true,
          organizationId: "test-org-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      ctx.db.emailAutomation.findMany.mockResolvedValue(mockAutomations);

      const result = await caller.list();
      expect(result).toHaveLength(1);
      expect(result[0].trigger).toBe("PAYMENT_RECEIVED");
    });
  });

  describe("create", () => {
    it("creates a new automation", async () => {
      const input = {
        trigger: "PAYMENT_RECEIVED" as const,
        delayDays: 0,
        templateSubject: "Thank you for your payment!",
        templateBody: "Hi {{clientName}}, thanks for paying invoice #{{invoiceNumber}}.",
      };

      ctx.db.emailAutomation.create.mockResolvedValue({
        id: "auto_new",
        ...input,
        enabled: true,
        organizationId: "test-org-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await caller.create(input);
      expect(result.id).toBe("auto_new");
      expect(ctx.db.emailAutomation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            trigger: "PAYMENT_RECEIVED",
            organizationId: "test-org-123",
          }),
        })
      );
    });
  });

  describe("update", () => {
    it("updates an existing automation", async () => {
      ctx.db.emailAutomation.findFirst.mockResolvedValue({
        id: "auto_1",
        organizationId: "test-org-123",
      });
      ctx.db.emailAutomation.update.mockResolvedValue({
        id: "auto_1",
        enabled: false,
      });

      const result = await caller.update({ id: "auto_1", enabled: false });
      expect(result.enabled).toBe(false);
    });

    it("throws NOT_FOUND for wrong org", async () => {
      ctx.db.emailAutomation.findFirst.mockResolvedValue(null);

      await expect(
        caller.update({ id: "auto_1", enabled: false })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("delete", () => {
    it("deletes an automation", async () => {
      ctx.db.emailAutomation.findFirst.mockResolvedValue({
        id: "auto_1",
        organizationId: "test-org-123",
      });
      ctx.db.emailAutomation.delete.mockResolvedValue({ id: "auto_1" });

      const result = await caller.delete({ id: "auto_1" });
      expect(result.success).toBe(true);
    });
  });
});
```

**Run:** `npx vitest run src/test/routers-email-automations.test.ts`
**Expected:** FAIL (module not found)

#### Step 2: Implement the router

Create `src/server/routers/emailAutomations.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { requireRole } from "../trpc";

const triggerEnum = z.enum([
  "PAYMENT_RECEIVED",
  "INVOICE_SENT",
  "INVOICE_VIEWED",
  "INVOICE_OVERDUE",
]);

export const emailAutomationsRouter = router({
  list: requireRole("OWNER", "ADMIN").query(async ({ ctx }) => {
    return ctx.db.emailAutomation.findMany({
      where: { organizationId: ctx.orgId },
      orderBy: { createdAt: "asc" },
    });
  }),

  create: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        trigger: triggerEnum,
        delayDays: z.number().int().min(0).max(90).default(0),
        templateSubject: z.string().min(1).max(200),
        templateBody: z.string().min(1).max(5000),
        enabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.emailAutomation.create({
        data: {
          trigger: input.trigger,
          delayDays: input.delayDays,
          templateSubject: input.templateSubject,
          templateBody: input.templateBody,
          enabled: input.enabled,
          organizationId: ctx.orgId,
        },
      });
    }),

  update: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        id: z.string(),
        trigger: triggerEnum.optional(),
        delayDays: z.number().int().min(0).max(90).optional(),
        templateSubject: z.string().min(1).max(200).optional(),
        templateBody: z.string().min(1).max(5000).optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.emailAutomation.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const { id, ...data } = input;
      return ctx.db.emailAutomation.update({
        where: { id },
        data: Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== undefined)
        ),
      });
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.emailAutomation.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.emailAutomation.delete({ where: { id: input.id } });
      return { success: true };
    }),

  getLogs: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        automationId: z.string().optional(),
        limit: z.number().int().max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.emailAutomationLog.findMany({
        where: {
          automation: { organizationId: ctx.orgId },
          ...(input.automationId ? { automationId: input.automationId } : {}),
        },
        orderBy: { sentAt: "desc" },
        take: input.limit,
        include: {
          automation: { select: { trigger: true, templateSubject: true } },
        },
      });
    }),
});
```

#### Step 3: Register in app router

In `src/server/routers/_app.ts`, add:

```typescript
import { emailAutomationsRouter } from "./emailAutomations";
```

And in the `router({})` call:

```typescript
  emailAutomations: emailAutomationsRouter,
```

**Run:** `npx vitest run src/test/routers-email-automations.test.ts`
**Expected:** PASS (5 tests)

#### Step 4: Commit

```bash
git add src/server/routers/emailAutomations.ts src/server/routers/_app.ts src/test/routers-email-automations.test.ts
git commit -m "$(cat <<'EOF'
feat(B3.2): add email automations tRPC router with CRUD and logs

OWNER/ADMIN-guarded CRUD for email automations with trigger type,
delay, template subject/body. Includes getLogs procedure and full
test coverage with mock context.
EOF
)"
```

---

### Task B3.3: Automation Template Variable Engine

**Files:**
- Create: `src/server/services/automation-template.ts`
- Test: `src/test/automation-template.test.ts` (new)

#### Step 1: Write failing tests

Create `src/test/automation-template.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  interpolateTemplate,
  AVAILABLE_VARIABLES,
  type TemplateVariables,
} from "@/server/services/automation-template";

describe("Automation Template Engine", () => {
  const vars: TemplateVariables = {
    clientName: "Acme Corp",
    invoiceNumber: "INV-001",
    amountDue: "$1,500.00",
    dueDate: "April 15, 2026",
    paymentLink: "https://example.com/portal/tok123",
    orgName: "My Agency",
    amountPaid: "$500.00",
    paymentDate: "March 30, 2026",
  };

  describe("interpolateTemplate", () => {
    it("replaces all known variables", () => {
      const template = "Hi {{clientName}}, invoice #{{invoiceNumber}} for {{amountDue}} is due {{dueDate}}.";
      const result = interpolateTemplate(template, vars);
      expect(result).toBe("Hi Acme Corp, invoice #INV-001 for $1,500.00 is due April 15, 2026.");
    });

    it("handles multiple occurrences of the same variable", () => {
      const template = "{{clientName}} owes {{amountDue}}. Reminder: {{clientName}}.";
      const result = interpolateTemplate(template, vars);
      expect(result).toBe("Acme Corp owes $1,500.00. Reminder: Acme Corp.");
    });

    it("leaves unknown variables untouched", () => {
      const template = "Hi {{clientName}}, {{unknownVar}}!";
      const result = interpolateTemplate(template, vars);
      expect(result).toBe("Hi Acme Corp, {{unknownVar}}!");
    });

    it("handles empty template", () => {
      expect(interpolateTemplate("", vars)).toBe("");
    });

    it("handles template with no variables", () => {
      expect(interpolateTemplate("Hello world", vars)).toBe("Hello world");
    });

    it("handles whitespace inside braces", () => {
      const template = "Hi {{ clientName }}, due {{ dueDate }}.";
      const result = interpolateTemplate(template, vars);
      expect(result).toBe("Hi Acme Corp, due April 15, 2026.");
    });
  });

  describe("AVAILABLE_VARIABLES", () => {
    it("lists all supported variables", () => {
      expect(AVAILABLE_VARIABLES).toContain("clientName");
      expect(AVAILABLE_VARIABLES).toContain("invoiceNumber");
      expect(AVAILABLE_VARIABLES).toContain("amountDue");
      expect(AVAILABLE_VARIABLES).toContain("dueDate");
      expect(AVAILABLE_VARIABLES).toContain("paymentLink");
    });
  });
});
```

**Run:** `npx vitest run src/test/automation-template.test.ts`
**Expected:** FAIL (module not found)

#### Step 2: Implement template engine

Create `src/server/services/automation-template.ts`:

```typescript
export const AVAILABLE_VARIABLES = [
  "clientName",
  "invoiceNumber",
  "amountDue",
  "dueDate",
  "paymentLink",
  "orgName",
  "amountPaid",
  "paymentDate",
] as const;

export type TemplateVariables = Record<(typeof AVAILABLE_VARIABLES)[number], string>;

/**
 * Interpolate {{variable}} placeholders in a template string.
 * Supports whitespace inside braces: {{ variable }}.
 * Unknown variables are left untouched.
 */
export function interpolateTemplate(
  template: string,
  variables: Partial<TemplateVariables>
): string {
  if (!template) return "";

  return template.replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (match, key: string) => {
      if (key in variables && variables[key as keyof TemplateVariables] !== undefined) {
        return variables[key as keyof TemplateVariables]!;
      }
      return match;
    }
  );
}

/**
 * Build template variables from invoice and related data.
 */
export function buildTemplateVariables(params: {
  clientName: string;
  invoiceNumber: string;
  total: number;
  amountPaid: number;
  dueDate: Date | null;
  portalToken: string;
  orgName: string;
  currencySymbol: string;
  appUrl: string;
}): TemplateVariables {
  const {
    clientName,
    invoiceNumber,
    total,
    amountPaid,
    dueDate,
    portalToken,
    orgName,
    currencySymbol,
    appUrl,
  } = params;

  const balance = total - amountPaid;

  return {
    clientName,
    invoiceNumber,
    amountDue: `${currencySymbol}${balance.toFixed(2)}`,
    dueDate: dueDate
      ? dueDate.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "N/A",
    paymentLink: `${appUrl}/portal/${portalToken}`,
    orgName,
    amountPaid: `${currencySymbol}${amountPaid.toFixed(2)}`,
    paymentDate: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  };
}
```

**Run:** `npx vitest run src/test/automation-template.test.ts`
**Expected:** PASS (7 tests)

#### Step 3: Commit

```bash
git add src/server/services/automation-template.ts src/test/automation-template.test.ts
git commit -m "$(cat <<'EOF'
feat(B3.3): add automation template variable interpolation engine

Supports {{clientName}}, {{invoiceNumber}}, {{amountDue}}, {{dueDate}},
{{paymentLink}}, {{orgName}}, {{amountPaid}}, {{paymentDate}} with
whitespace tolerance and unknown variable passthrough. Includes
buildTemplateVariables helper and full test coverage.
EOF
)"
```

---

### Task B3.4: Inngest Automation Processor Function

**Files:**
- Create: `src/inngest/functions/email-automations.ts`
- Modify: `src/app/api/inngest/route.ts`
- Test: `src/test/inngest-email-automations.test.ts` (new)

#### Step 1: Write failing tests

Create `src/test/inngest-email-automations.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  shouldSendAutomation,
  getEligibleInvoicesForTrigger,
} from "@/inngest/functions/email-automations";

describe("Email Automation Inngest Helpers", () => {
  describe("shouldSendAutomation", () => {
    it("returns true when delay days have passed since trigger event", () => {
      const triggerDate = new Date("2026-03-20T00:00:00Z");
      const now = new Date("2026-03-23T12:00:00Z");
      expect(shouldSendAutomation(triggerDate, 3, now)).toBe(true);
    });

    it("returns false when delay days have not yet passed", () => {
      const triggerDate = new Date("2026-03-20T00:00:00Z");
      const now = new Date("2026-03-22T12:00:00Z");
      expect(shouldSendAutomation(triggerDate, 3, now)).toBe(false);
    });

    it("returns true for immediate (0 delay) automation", () => {
      const triggerDate = new Date("2026-03-20T00:00:00Z");
      const now = new Date("2026-03-20T00:01:00Z");
      expect(shouldSendAutomation(triggerDate, 0, now)).toBe(true);
    });

    it("returns true when exactly on the boundary", () => {
      const triggerDate = new Date("2026-03-20T00:00:00Z");
      const now = new Date("2026-03-23T00:00:00Z");
      expect(shouldSendAutomation(triggerDate, 3, now)).toBe(true);
    });
  });

  describe("getEligibleInvoicesForTrigger", () => {
    it("returns PAYMENT_RECEIVED trigger date from last payment", () => {
      const invoice = {
        status: "PAID",
        lastSent: new Date("2026-03-01"),
        lastViewed: new Date("2026-03-05"),
        payments: [
          { paidAt: new Date("2026-03-10") },
          { paidAt: new Date("2026-03-15") },
        ],
      };
      const date = getEligibleInvoicesForTrigger("PAYMENT_RECEIVED", invoice as any);
      expect(date).toEqual(new Date("2026-03-15"));
    });

    it("returns INVOICE_SENT trigger date from lastSent", () => {
      const invoice = {
        status: "SENT",
        lastSent: new Date("2026-03-01"),
        lastViewed: null,
        payments: [],
      };
      const date = getEligibleInvoicesForTrigger("INVOICE_SENT", invoice as any);
      expect(date).toEqual(new Date("2026-03-01"));
    });

    it("returns INVOICE_VIEWED trigger date from lastViewed", () => {
      const invoice = {
        status: "SENT",
        lastSent: new Date("2026-03-01"),
        lastViewed: new Date("2026-03-05"),
        payments: [],
      };
      const date = getEligibleInvoicesForTrigger("INVOICE_VIEWED", invoice as any);
      expect(date).toEqual(new Date("2026-03-05"));
    });

    it("returns null for INVOICE_VIEWED when not viewed", () => {
      const invoice = {
        status: "SENT",
        lastSent: new Date("2026-03-01"),
        lastViewed: null,
        payments: [],
      };
      const date = getEligibleInvoicesForTrigger("INVOICE_VIEWED", invoice as any);
      expect(date).toBeNull();
    });

    it("returns null for INVOICE_SENT when not sent", () => {
      const invoice = {
        status: "DRAFT",
        lastSent: null,
        lastViewed: null,
        payments: [],
      };
      const date = getEligibleInvoicesForTrigger("INVOICE_SENT", invoice as any);
      expect(date).toBeNull();
    });
  });
});
```

**Run:** `npx vitest run src/test/inngest-email-automations.test.ts`
**Expected:** FAIL (module not found)

#### Step 2: Implement the Inngest function

Create `src/inngest/functions/email-automations.ts`:

```typescript
import { inngest } from "../client";
import { db } from "@/server/db";
import { getOwnerBcc } from "@/server/services/email-bcc";
import {
  interpolateTemplate,
  buildTemplateVariables,
} from "@/server/services/automation-template";
import type { EmailAutomationTrigger } from "@/generated/prisma";

type InvoiceWithPayments = {
  id: string;
  number: string;
  status: string;
  lastSent: Date | null;
  lastViewed: Date | null;
  dueDate: Date | null;
  total: { toNumber(): number } | number;
  portalToken: string;
  organizationId: string;
  client: { name: string; email: string | null };
  currency: { symbol: string };
  payments: Array<{ amount: { toNumber(): number } | number; paidAt: Date }>;
};

/**
 * Determine the trigger event date for a given trigger type and invoice.
 * Returns null if the trigger condition hasn't been met.
 */
export function getEligibleInvoicesForTrigger(
  trigger: string,
  invoice: InvoiceWithPayments
): Date | null {
  switch (trigger) {
    case "PAYMENT_RECEIVED": {
      if (invoice.payments.length === 0) return null;
      // Use the most recent payment date
      const sorted = [...invoice.payments].sort(
        (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
      );
      return sorted[0].paidAt;
    }
    case "INVOICE_SENT":
      return invoice.lastSent ?? null;
    case "INVOICE_VIEWED":
      return invoice.lastViewed ?? null;
    case "INVOICE_OVERDUE":
      // Trigger date is the due date itself (overdue starts after)
      if (invoice.status !== "OVERDUE") return null;
      return invoice.dueDate ?? null;
    default:
      return null;
  }
}

/**
 * Check if enough days have passed since the trigger event for the delay.
 */
export function shouldSendAutomation(
  triggerDate: Date,
  delayDays: number,
  now: Date = new Date()
): boolean {
  const elapsed = now.getTime() - triggerDate.getTime();
  const delayMs = delayDays * 24 * 60 * 60 * 1000;
  return elapsed >= delayMs;
}

export const processEmailAutomations = inngest.createFunction(
  { id: "process-email-automations", name: "Process Email Automations" },
  { cron: "0 9 * * *" }, // daily at 9am UTC
  async () => {
    const now = new Date();

    // Fetch all enabled automations across all orgs
    const automations = await db.emailAutomation.findMany({
      where: { enabled: true },
      include: {
        organization: {
          select: { name: true },
        },
      },
    });

    if (automations.length === 0) {
      return { processed: 0, sent: 0, skipped: 0 };
    }

    // Group automations by org for efficient querying
    const orgIds = [...new Set(automations.map((a) => a.organizationId))];

    // Fetch all non-archived invoices with client emails for all relevant orgs
    const invoices = await db.invoice.findMany({
      where: {
        organizationId: { in: orgIds },
        isArchived: false,
        type: { in: ["SIMPLE", "DETAILED"] },
        client: { email: { not: null } },
      },
      include: {
        client: { select: { name: true, email: true } },
        currency: { select: { symbol: true } },
        payments: { select: { amount: true, paidAt: true } },
      },
    });

    // Fetch existing logs to prevent double-sends
    const existingLogs = await db.emailAutomationLog.findMany({
      where: {
        automationId: { in: automations.map((a) => a.id) },
      },
      select: { automationId: true, invoiceId: true },
    });

    const sentKeys = new Set(
      existingLogs.map((l) => `${l.automationId}:${l.invoiceId}`)
    );

    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    let sent = 0;
    let skipped = 0;

    const results = await Promise.allSettled(
      automations.flatMap((automation) => {
        const orgInvoices = invoices.filter(
          (inv) => inv.organizationId === automation.organizationId
        );

        return orgInvoices.map(async (invoice) => {
          const key = `${automation.id}:${invoice.id}`;
          if (sentKeys.has(key)) {
            skipped++;
            return;
          }

          if (!invoice.client.email) {
            skipped++;
            return;
          }

          const triggerDate = getEligibleInvoicesForTrigger(
            automation.trigger,
            invoice as any
          );
          if (!triggerDate) {
            skipped++;
            return;
          }

          if (!shouldSendAutomation(triggerDate, automation.delayDays, now)) {
            skipped++;
            return;
          }

          // Build variables and interpolate
          const amountPaid = invoice.payments.reduce(
            (sum, p) => sum + (typeof p.amount === "number" ? p.amount : p.amount.toNumber()),
            0
          );
          const total =
            typeof invoice.total === "number"
              ? invoice.total
              : (invoice.total as any).toNumber();

          const vars = buildTemplateVariables({
            clientName: invoice.client.name,
            invoiceNumber: invoice.number,
            total,
            amountPaid,
            dueDate: invoice.dueDate,
            portalToken: invoice.portalToken,
            orgName: automation.organization.name,
            currencySymbol: invoice.currency.symbol,
            appUrl,
          });

          const subject = interpolateTemplate(automation.templateSubject, vars);
          const body = interpolateTemplate(automation.templateBody, vars);

          // Wrap body in minimal HTML
          const html = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px;">
              <div style="white-space: pre-wrap; color: #374151; font-size: 15px; line-height: 1.6;">
                ${body}
              </div>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
              <p style="font-size: 12px; color: #9ca3af;">
                Sent by ${automation.organization.name}
              </p>
            </div>
          `;

          const bcc = await getOwnerBcc(invoice.organizationId);
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
            to: invoice.client.email,
            subject,
            html,
            ...(bcc ? { bcc } : {}),
          });

          // Log to prevent double-send
          await db.emailAutomationLog.create({
            data: {
              automationId: automation.id,
              invoiceId: invoice.id,
              recipientEmail: invoice.client.email,
            },
          });

          sent++;
        });
      })
    );

    return {
      processed: results.length,
      sent,
      skipped,
      failed: results.filter((r) => r.status === "rejected").length,
    };
  }
);
```

#### Step 3: Register in Inngest serve route

In `src/app/api/inngest/route.ts`, add:

```typescript
import { processEmailAutomations } from "@/inngest/functions/email-automations";
```

Add to the `functions` array:

```typescript
functions: [processRecurringInvoices, processOverdueInvoices, processPaymentReminders, cleanupPendingUsers, processRecurringExpenses, processEmailAutomations],
```

**Run:** `npx vitest run src/test/inngest-email-automations.test.ts`
**Expected:** PASS (9 tests)

#### Step 4: Commit

```bash
git add src/inngest/functions/email-automations.ts src/app/api/inngest/route.ts src/test/inngest-email-automations.test.ts
git commit -m "$(cat <<'EOF'
feat(B3.4): add Inngest email automation processor

Daily cron job evaluates all enabled automations against invoices,
checks trigger conditions and delay, prevents double-sends via
EmailAutomationLog, interpolates templates, and sends via Resend
with BCC to owner. Includes helper tests.
EOF
)"
```

---

### Task B3.5: Settings Page - Automations UI

**Files:**
- Create: `src/app/(dashboard)/settings/automations/page.tsx`
- Create: `src/components/settings/AutomationForm.tsx`
- Create: `src/components/settings/AutomationList.tsx`

#### Step 1: Create the automation list component

Create `src/components/settings/AutomationList.tsx`:

```tsx
"use client";

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Pencil, Trash2, Mail, Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const TRIGGER_LABELS: Record<string, { label: string; color: string; icon: typeof Mail }> = {
  PAYMENT_RECEIVED: { label: "Payment Received", color: "text-emerald-600", icon: Zap },
  INVOICE_SENT: { label: "Invoice Sent", color: "text-blue-600", icon: Mail },
  INVOICE_VIEWED: { label: "Invoice Viewed", color: "text-amber-600", icon: Mail },
  INVOICE_OVERDUE: { label: "Invoice Overdue", color: "text-red-600", icon: Clock },
};

type Props = {
  onEdit: (id: string) => void;
};

export function AutomationList({ onEdit }: Props) {
  const utils = trpc.useUtils();
  const { data: automations, isLoading } = trpc.emailAutomations.list.useQuery();

  const toggleMutation = trpc.emailAutomations.update.useMutation({
    onSuccess: () => {
      utils.emailAutomations.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = trpc.emailAutomations.delete.useMutation({
    onSuccess: () => {
      utils.emailAutomations.list.invalidate();
      toast.success("Automation deleted");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading automations...</div>;
  }

  if (!automations?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/50 bg-card p-8 text-center">
        <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          No automations configured. Create one to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {automations.map((auto) => {
        const trigger = TRIGGER_LABELS[auto.trigger] ?? {
          label: auto.trigger,
          color: "text-gray-600",
          icon: Mail,
        };
        const Icon = trigger.icon;

        return (
          <div
            key={auto.id}
            className="rounded-2xl border border-border/50 bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className={cn("rounded-lg bg-accent/50 p-2 mt-0.5")}>
                  <Icon className={cn("h-4 w-4", trigger.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">
                    {auto.templateSubject}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <span className={cn("font-medium", trigger.color)}>
                      {trigger.label}
                    </span>
                    {auto.delayDays > 0 && (
                      <span>
                        &middot; {auto.delayDays} day{auto.delayDays === 1 ? "" : "s"} delay
                      </span>
                    )}
                    {auto.delayDays === 0 && (
                      <span>&middot; Immediate</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {auto.templateBody.slice(0, 120)}
                    {auto.templateBody.length > 120 ? "..." : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={auto.enabled}
                  onCheckedChange={(enabled) =>
                    toggleMutation.mutate({ id: auto.id, enabled })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(auto.id)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm("Delete this automation?")) {
                      deleteMutation.mutate({ id: auto.id });
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

#### Step 2: Create the automation form component

Create `src/components/settings/AutomationForm.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, X, Info } from "lucide-react";
import { AVAILABLE_VARIABLES } from "@/server/services/automation-template";

type Props = {
  editId?: string | null;
  onClose: () => void;
};

const TRIGGER_OPTIONS = [
  { value: "PAYMENT_RECEIVED", label: "Payment Received" },
  { value: "INVOICE_SENT", label: "Invoice Sent" },
  { value: "INVOICE_VIEWED", label: "Invoice Viewed" },
  { value: "INVOICE_OVERDUE", label: "Invoice Overdue" },
];

export function AutomationForm({ editId, onClose }: Props) {
  const utils = trpc.useUtils();
  const { data: automations } = trpc.emailAutomations.list.useQuery();
  const existing = editId ? automations?.find((a) => a.id === editId) : null;

  const [trigger, setTrigger] = useState(existing?.trigger ?? "PAYMENT_RECEIVED");
  const [delayDays, setDelayDays] = useState(existing?.delayDays ?? 0);
  const [subject, setSubject] = useState(existing?.templateSubject ?? "");
  const [body, setBody] = useState(existing?.templateBody ?? "");

  useEffect(() => {
    if (existing) {
      setTrigger(existing.trigger);
      setDelayDays(existing.delayDays);
      setSubject(existing.templateSubject);
      setBody(existing.templateBody);
    }
  }, [existing]);

  const createMutation = trpc.emailAutomations.create.useMutation({
    onSuccess: () => {
      utils.emailAutomations.list.invalidate();
      toast.success("Automation created");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.emailAutomations.update.useMutation({
    onSuccess: () => {
      utils.emailAutomations.list.invalidate();
      toast.success("Automation updated");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      updateMutation.mutate({
        id: editId,
        trigger: trigger as any,
        delayDays,
        templateSubject: subject,
        templateBody: body,
      });
    } else {
      createMutation.mutate({
        trigger: trigger as any,
        delayDays,
        templateSubject: subject,
        templateBody: body,
      });
    }
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground">
          {editId ? "Edit Automation" : "New Automation"}
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Trigger</Label>
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Delay (days)</Label>
            <Input
              type="number"
              min={0}
              max={90}
              value={delayDays}
              onChange={(e) => setDelayDays(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              0 = send immediately when triggered
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Email Subject</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Thank you for your payment, {{clientName}}!"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label>Email Body</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hi {{clientName}},&#10;&#10;Thank you for paying invoice #{{invoiceNumber}}..."
            rows={6}
            required
          />
        </div>

        {/* Variable reference */}
        <div className="rounded-xl bg-accent/30 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">
              Available Variables
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_VARIABLES.map((v) => (
              <code
                key={v}
                className="rounded bg-background px-1.5 py-0.5 text-xs text-foreground font-mono cursor-pointer hover:bg-accent"
                onClick={() => {
                  setBody((prev) => prev + `{{${v}}}`);
                }}
                title={`Click to insert {{${v}}}`}
              >
                {"{{"}
                {v}
                {"}}"}
              </code>
            ))}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !subject || !body}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {editId ? "Update" : "Create"} Automation
          </Button>
        </div>
      </form>
    </div>
  );
}
```

#### Step 3: Create settings page

Create `src/app/(dashboard)/settings/automations/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { AutomationList } from "@/components/settings/AutomationList";
import { AutomationForm } from "@/components/settings/AutomationForm";

export default function AutomationsSettingsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const handleEdit = (id: string) => {
    setEditId(id);
    setShowForm(true);
  };

  const handleClose = () => {
    setShowForm(false);
    setEditId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Email Automations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure automated emails triggered by invoice events.
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Automation
          </Button>
        )}
      </div>

      {showForm && (
        <AutomationForm editId={editId} onClose={handleClose} />
      )}

      <AutomationList onEdit={handleEdit} />
    </div>
  );
}
```

#### Step 4: Commit

```bash
git add src/app/\(dashboard\)/settings/automations/ src/components/settings/AutomationForm.tsx src/components/settings/AutomationList.tsx
git commit -m "$(cat <<'EOF'
feat(B3.5): add email automations settings page with CRUD UI

Settings page at /settings/automations with automation list (toggle,
edit, delete), creation form with trigger selector, delay config,
subject/body editors with clickable template variable reference.
EOF
)"
```

---

### Task B3.6: Event Triggers Integration

**Files:**
- Modify: `src/app/portal/[token]/layout.tsx` (fire INVOICE_VIEWED event)
- Create: `src/inngest/functions/email-automation-events.ts` (event-driven immediate automations)
- Modify: `src/app/api/inngest/route.ts` (register new function)

#### Step 1: Add Inngest event-driven function for immediate automations

Create `src/inngest/functions/email-automation-events.ts`:

```typescript
import { inngest } from "../client";
import { db } from "@/server/db";
import { getOwnerBcc } from "@/server/services/email-bcc";
import {
  interpolateTemplate,
  buildTemplateVariables,
} from "@/server/services/automation-template";
import type { EmailAutomationTrigger } from "@/generated/prisma";

/**
 * Event-driven automation handler for immediate (delayDays=0) automations.
 * Triggered by Inngest events when invoice state changes.
 */
export const handleAutomationEvent = inngest.createFunction(
  { id: "handle-automation-event", name: "Handle Email Automation Event" },
  [
    { event: "invoice/payment.received" },
    { event: "invoice/sent" },
    { event: "invoice/viewed" },
  ],
  async ({ event }) => {
    const { invoiceId, trigger } = event.data as {
      invoiceId: string;
      trigger: EmailAutomationTrigger;
    };

    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: { select: { name: true, email: true } },
        currency: { select: { symbol: true } },
        organization: { select: { name: true } },
        payments: { select: { amount: true, paidAt: true } },
      },
    });

    if (!invoice || !invoice.client.email) return { skipped: true };

    // Find matching automations with 0 delay (immediate)
    const automations = await db.emailAutomation.findMany({
      where: {
        organizationId: invoice.organizationId,
        trigger,
        enabled: true,
        delayDays: 0,
      },
    });

    if (automations.length === 0) return { skipped: true, reason: "no matching automations" };

    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    let sent = 0;

    for (const automation of automations) {
      // Check for existing log (prevent double-send)
      const existing = await db.emailAutomationLog.findFirst({
        where: { automationId: automation.id, invoiceId: invoice.id },
      });
      if (existing) continue;

      const amountPaid = invoice.payments.reduce(
        (sum, p) => sum + Number(p.amount),
        0
      );

      const vars = buildTemplateVariables({
        clientName: invoice.client.name,
        invoiceNumber: invoice.number,
        total: Number(invoice.total),
        amountPaid,
        dueDate: invoice.dueDate,
        portalToken: invoice.portalToken,
        orgName: invoice.organization.name,
        currencySymbol: invoice.currency.symbol,
        appUrl,
      });

      const subject = interpolateTemplate(automation.templateSubject, vars);
      const body = interpolateTemplate(automation.templateBody, vars);

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px;">
          <div style="white-space: pre-wrap; color: #374151; font-size: 15px; line-height: 1.6;">
            ${body}
          </div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #9ca3af;">
            Sent by ${invoice.organization.name}
          </p>
        </div>
      `;

      try {
        const bcc = await getOwnerBcc(invoice.organizationId);
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
          to: invoice.client.email,
          subject,
          html,
          ...(bcc ? { bcc } : {}),
        });

        await db.emailAutomationLog.create({
          data: {
            automationId: automation.id,
            invoiceId: invoice.id,
            recipientEmail: invoice.client.email,
          },
        });

        sent++;
      } catch {
        // Non-fatal per automation
      }
    }

    return { sent, total: automations.length };
  }
);
```

#### Step 2: Fire events from existing code paths

In `src/app/portal/[token]/layout.tsx`, after the first-view notification block (around line 128, before `return <>{children}</>`), add:

```typescript
  // Fire Inngest event for automation triggers
  if (isFirstView) {
    try {
      const { inngest: inngestClient } = await import("@/inngest/client");
      await inngestClient.send({
        name: "invoice/viewed",
        data: { invoiceId: invoice.id, trigger: "INVOICE_VIEWED" },
      });
    } catch {
      // Non-fatal
    }
  }
```

**Note:** The `invoice/sent` and `invoice/payment.received` events should be fired from the existing invoice send flow and webhook payment flow respectively. These integrations should be added to:
- Invoice send action (in the invoices router or send email flow) - fire `invoice/sent`
- Stripe webhook handler (in `src/app/api/webhooks/stripe/route.ts`) - fire `invoice/payment.received`

For now, add comments marking where these events should be wired:

```typescript
// TODO (B3.6): Fire inngest.send({ name: "invoice/sent", data: { invoiceId, trigger: "INVOICE_SENT" } })
// TODO (B3.6): Fire inngest.send({ name: "invoice/payment.received", data: { invoiceId, trigger: "PAYMENT_RECEIVED" } })
```

#### Step 3: Register in Inngest serve route

In `src/app/api/inngest/route.ts`, add:

```typescript
import { handleAutomationEvent } from "@/inngest/functions/email-automation-events";
```

Add to the `functions` array:

```typescript
functions: [processRecurringInvoices, processOverdueInvoices, processPaymentReminders, cleanupPendingUsers, processRecurringExpenses, processEmailAutomations, handleAutomationEvent],
```

#### Step 4: Commit

```bash
git add src/inngest/functions/email-automation-events.ts src/app/api/inngest/route.ts src/app/portal/\[token\]/layout.tsx
git commit -m "$(cat <<'EOF'
feat(B3.6): add event-driven automation triggers for immediate sends

Event-driven Inngest function handles immediate (0-delay) automations
triggered by invoice/viewed, invoice/sent, and invoice/payment.received
events. Portal layout fires INVOICE_VIEWED event on first view.
EOF
)"
```

---

## Summary of All Files

### New Files Created
| File | Feature |
|------|---------|
| `src/server/services/portal-dashboard.ts` | B1.1 - Session helpers |
| `src/test/portal-dashboard-helpers.test.ts` | B1.1 - Session helper tests |
| `src/test/portal-dashboard-procedures.test.ts` | B1.2 - Dashboard procedure tests |
| `src/app/portal/dashboard/[clientToken]/layout.tsx` | B1.3 - Dashboard layout |
| `src/app/portal/dashboard/[clientToken]/page.tsx` | B1.7 - Dashboard page |
| `src/app/portal/dashboard/[clientToken]/login/page.tsx` | B1.3 - Dashboard login |
| `src/app/portal/dashboard/[clientToken]/loading.tsx` | B1.3 - Loading skeleton |
| `src/app/api/portal/dashboard/[clientToken]/auth/route.ts` | B1.3 - Dashboard auth API |
| `src/app/api/portal/dashboard/[clientToken]/statement/route.ts` | B1.7 - Statement PDF API |
| `src/components/portal/DashboardSummaryCards.tsx` | B1.4 - Summary cards |
| `src/components/portal/DashboardInvoiceTable.tsx` | B1.5 - Invoice table |
| `src/components/portal/DashboardPaymentHistory.tsx` | B1.6 - Payment history |
| `src/components/portal/DashboardProjects.tsx` | B1.6 - Active projects |
| `src/server/services/signature.ts` | B2.2 - Signature helpers |
| `src/test/signature-helpers.test.ts` | B2.2 - Signature helper tests |
| `src/test/portal-signature-procedures.test.ts` | B2.3 - Signature procedure tests |
| `src/components/portal/SignatureCapture.tsx` | B2.4 - Canvas/type widget |
| `src/components/portal/ProposalSignatureForm.tsx` | B2.5 - Signature form |
| `src/emails/ProposalSignedEmail.tsx` | B2.7 - Signed notification email |
| `src/server/services/automation-template.ts` | B3.3 - Template engine |
| `src/test/automation-template.test.ts` | B3.3 - Template engine tests |
| `src/server/routers/emailAutomations.ts` | B3.2 - Automations router |
| `src/test/routers-email-automations.test.ts` | B3.2 - Router tests |
| `src/inngest/functions/email-automations.ts` | B3.4 - Cron processor |
| `src/test/inngest-email-automations.test.ts` | B3.4 - Processor tests |
| `src/inngest/functions/email-automation-events.ts` | B3.6 - Event handler |
| `src/components/settings/AutomationList.tsx` | B3.5 - List component |
| `src/components/settings/AutomationForm.tsx` | B3.5 - Form component |
| `src/app/(dashboard)/settings/automations/page.tsx` | B3.5 - Settings page |

### Modified Files
| File | Feature |
|------|---------|
| `prisma/schema.prisma` | B1.1, B2.1, B3.1 - New models |
| `src/server/routers/portal.ts` | B1.2, B2.3, B2.7 - New procedures |
| `src/server/routers/_app.ts` | B3.2 - Register automations router |
| `src/test/mocks/prisma.ts` | B1.1, B2.1, B3.1 - Mock updates |
| `src/app/portal/[token]/page.tsx` | B2.5 - Signature form integration |
| `src/server/services/proposal-pdf.tsx` | B2.6 - Signature in PDF |
| `src/app/api/inngest/route.ts` | B3.4, B3.6 - Register functions |
| `src/app/portal/[token]/layout.tsx` | B3.6 - Fire viewed event |

### Test Commands
```bash
# Run all new tests
npx vitest run src/test/portal-dashboard-helpers.test.ts
npx vitest run src/test/portal-dashboard-procedures.test.ts
npx vitest run src/test/signature-helpers.test.ts
npx vitest run src/test/portal-signature-procedures.test.ts
npx vitest run src/test/automation-template.test.ts
npx vitest run src/test/routers-email-automations.test.ts
npx vitest run src/test/inngest-email-automations.test.ts

# Run all tests
npx vitest run
```

### Prisma Migrations
```bash
npx prisma migrate dev --name add-client-portal-session     # B1.1
npx prisma migrate dev --name add-signature-fields           # B2.1
npx prisma migrate dev --name add-email-automations          # B3.1
```
