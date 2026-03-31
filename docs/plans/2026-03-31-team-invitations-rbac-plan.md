# Team Invitations & RBAC Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add team member invitations with role-based access control (Owner, Admin, Accountant, Viewer) to the Pancake invoicing app.

**Architecture:** New `Invitation` model + updated `UserRole` enum in Prisma. A `team` tRPC router handles invite CRUD. A `requireRole()` middleware enforces permissions across all existing routers. Invitation emails sent via Resend with React Email templates. Invite acceptance via `/invite/[token]` page that handles both existing and new users.

**Tech Stack:** Next.js 16, TypeScript, tRPC v11, Prisma 7, Supabase Auth, Resend, React Email

---

### Task 1: Update Schema — UserRole Enum and Invitation Model

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Update the UserRole enum**

In `prisma/schema.prisma`, replace the existing `UserRole` enum (around line 12):

```prisma
enum UserRole {
  OWNER
  ADMIN
  ACCOUNTANT
  VIEWER
}
```

**Step 2: Add InvitationStatus enum**

Add after the existing enums (after `TicketStatus`):

```prisma
enum InvitationStatus {
  PENDING
  ACCEPTED
  EXPIRED
  REVOKED
}
```

**Step 3: Add Invitation model**

Add after the `User` model:

```prisma
model Invitation {
  id        String           @id @default(cuid())
  email     String
  role      UserRole         @default(VIEWER)
  token     String           @unique @default(cuid())
  expiresAt DateTime
  status    InvitationStatus @default(PENDING)

  invitedById    String
  invitedBy      User         @relation("InvitedBy", fields: [invitedById], references: [id])
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@unique([email, organizationId])
}
```

**Step 4: Add relations to User and Organization**

Add to the `User` model (after `organization` relation):

```prisma
  invitationsSent Invitation[] @relation("InvitedBy")
```

Add to the `Organization` model (in the relations section):

```prisma
  invitations     Invitation[]
```

**Step 5: Update User.role default**

Change `User.role` default from `STAFF` to `ADMIN`:

```prisma
  role        UserRole @default(ADMIN)
```

**Step 6: Create migration and regenerate Prisma client**

Run:
```bash
cd /Users/mlaplante/Sites/pancake
npx prisma migrate dev --name add-team-invitations-rbac
```

This will:
- Prompt about renaming enum values (STAFF -> VIEWER). Choose to rename.
- Create the migration SQL
- Regenerate the Prisma client

**Important:** If the migration has issues with renaming enum values, you may need to write a custom migration. The key SQL would be:
```sql
ALTER TYPE "UserRole" ADD VALUE 'OWNER';
ALTER TYPE "UserRole" ADD VALUE 'ACCOUNTANT';
ALTER TYPE "UserRole" ADD VALUE 'VIEWER';
-- Then update existing STAFF users to ADMIN
UPDATE "User" SET "role" = 'ADMIN' WHERE "role" = 'STAFF';
```

**Step 7: Update existing org creator to OWNER**

After migration, run a one-time update (can be done in migration SQL):
```sql
-- Set existing users to OWNER (they're all org creators currently)
UPDATE "User" SET "role" = 'OWNER';
```

**Step 8: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds (any code referencing `STAFF` will need updating — check in next steps)

**Step 9: Commit**

```bash
git add prisma/
git commit -m "feat: add Invitation model and update UserRole enum for RBAC"
```

---

### Task 2: Add `userRole` to tRPC Context and Create `requireRole` Middleware

**Files:**
- Modify: `src/server/trpc.ts`

**Step 1: Read the current file**

Read `src/server/trpc.ts` to see the current context setup.

**Step 2: Update `createTRPCContext` to fetch userRole**

Replace the entire file with:

```typescript
import { initTRPC, TRPCError } from "@trpc/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "./db";
import superjson from "superjson";
import { ZodError } from "zod";
import type { UserRole } from "@/generated/prisma";

export const createTRPCContext = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user?.id ?? null;
  const orgId = (user?.app_metadata?.organizationId as string) ?? null;

  // Fetch the user's role from the database
  let userRole: UserRole | null = null;
  if (userId && orgId) {
    const dbUser = await db.user.findFirst({
      where: { supabaseId: userId, organizationId: orgId },
      select: { role: true },
    });
    userRole = dbUser?.role ?? null;
  }

  return { db, userId, orgId, userRole };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId || !ctx.orgId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const orgId = ctx.orgId;
  return next({ ctx: { ...ctx, userId: ctx.userId, orgId, userRole: ctx.userRole } });
});

export const requireRole = (...allowed: UserRole[]) =>
  protectedProcedure.use(({ ctx, next }) => {
    if (!ctx.userRole || !allowed.includes(ctx.userRole)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
    }
    return next({ ctx });
  });
```

**Step 3: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/server/trpc.ts
git commit -m "feat: add userRole to tRPC context and requireRole middleware"
```

---

### Task 3: Create Team Invite Email Template

**Files:**
- Create: `src/emails/TeamInviteEmail.tsx`

**Step 1: Create the email template**

Look at an existing email template first for the exact pattern:

Read: `src/emails/InvoiceSentEmail.tsx`

Then create `src/emails/TeamInviteEmail.tsx` following the same pattern:

```tsx
import {
  Html,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Img,
} from "@react-email/components";
import * as React from "react";

const ACCENT = "#2563eb";

type Props = {
  inviterName: string;
  orgName: string;
  role: string;
  acceptUrl: string;
  logoUrl?: string | null;
};

export default function TeamInviteEmail({
  inviterName,
  orgName,
  role,
  acceptUrl,
  logoUrl,
}: Props) {
  return (
    <Html>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif", backgroundColor: "#f9fafb", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px" }}>
          <Section style={{ backgroundColor: "#fff", borderRadius: 12, padding: 32, border: "1px solid #e5e7eb" }}>
            {logoUrl && (
              <Img src={logoUrl} alt={orgName} height={40} style={{ marginBottom: 24 }} />
            )}
            <Text style={{ fontSize: 20, fontWeight: 700, color: "#111", marginBottom: 8 }}>
              You&apos;ve been invited to join {orgName}
            </Text>
            <Text style={{ fontSize: 14, color: "#555", lineHeight: "1.6" }}>
              {inviterName} has invited you to join <strong>{orgName}</strong> on Pancake
              as {role === "ADMIN" ? "an" : "a"} <strong>{role.charAt(0) + role.slice(1).toLowerCase()}</strong>.
            </Text>
            <Button
              href={acceptUrl}
              style={{
                display: "inline-block",
                backgroundColor: ACCENT,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                padding: "12px 24px",
                borderRadius: 8,
                textDecoration: "none",
                marginTop: 16,
                marginBottom: 16,
              }}
            >
              Accept Invitation
            </Button>
            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />
            <Text style={{ fontSize: 12, color: "#999" }}>
              This invitation expires in 7 days. If you didn&apos;t expect this email, you can ignore it.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

**Step 2: Commit**

```bash
git add src/emails/TeamInviteEmail.tsx
git commit -m "feat: add TeamInviteEmail React Email template"
```

---

### Task 4: Create Team tRPC Router

**Files:**
- Create: `src/server/routers/team.ts`
- Modify: `src/server/routers/index.ts` (or wherever routers are merged)

**Step 1: Find the router index**

Search for where routers are combined. Look at `src/server/routers/index.ts` or `src/server/root.ts` or similar — find the file that merges all routers with `router({ invoices: invoicesRouter, ... })`.

**Step 2: Create the team router**

Create `src/server/routers/team.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole, publicProcedure } from "../trpc";
import { Resend } from "resend";
import { render } from "@react-email/render";
import TeamInviteEmail from "@/emails/TeamInviteEmail";

const resend = new Resend(process.env.RESEND_API_KEY);

export const teamRouter = router({
  /** List all members of the current organization */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.user.findMany({
      where: { organizationId: ctx.orgId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }),

  /** Send an invitation email */
  invite: requireRole("OWNER", "ADMIN").input(
    z.object({
      email: z.string().email(),
      role: z.enum(["ADMIN", "ACCOUNTANT", "VIEWER"]),
    })
  ).mutation(async ({ ctx, input }) => {
    // Check if user is already a member
    const existingUser = await ctx.db.user.findFirst({
      where: { email: input.email, organizationId: ctx.orgId },
    });
    if (existingUser) {
      throw new TRPCError({ code: "CONFLICT", message: "This person is already a member of your organization" });
    }

    // Check if user belongs to another org
    const userInOtherOrg = await ctx.db.user.findFirst({
      where: { email: input.email, organizationId: { not: ctx.orgId } },
    });
    if (userInOtherOrg) {
      throw new TRPCError({ code: "CONFLICT", message: "This person already belongs to another organization" });
    }

    // Revoke any existing pending invite for this email
    await ctx.db.invitation.updateMany({
      where: {
        email: input.email,
        organizationId: ctx.orgId,
        status: "PENDING",
      },
      data: { status: "REVOKED" },
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await ctx.db.invitation.create({
      data: {
        email: input.email,
        role: input.role,
        expiresAt,
        invitedById: ctx.userId,
        organizationId: ctx.orgId,
      },
    });

    // Get inviter and org info for the email
    const [inviter, org] = await Promise.all([
      ctx.db.user.findFirst({ where: { supabaseId: ctx.userId }, select: { firstName: true, lastName: true, email: true } }),
      ctx.db.organization.findFirst({ where: { id: ctx.orgId }, select: { name: true, logoUrl: true } }),
    ]);

    const inviterName = inviter?.firstName
      ? `${inviter.firstName}${inviter.lastName ? ` ${inviter.lastName}` : ""}`
      : inviter?.email ?? "Someone";

    const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.token}`;

    const html = await render(
      TeamInviteEmail({
        inviterName,
        orgName: org?.name ?? "your organization",
        role: input.role,
        acceptUrl,
        logoUrl: org?.logoUrl,
      })
    );

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: input.email,
      subject: `${inviterName} invited you to join ${org?.name ?? "their organization"} on Pancake`,
      html,
    });

    return { inviteUrl: acceptUrl, invitation };
  }),

  /** List pending invitations */
  pendingInvites: requireRole("OWNER", "ADMIN").query(async ({ ctx }) => {
    return ctx.db.invitation.findMany({
      where: {
        organizationId: ctx.orgId,
        status: "PENDING",
      },
      include: {
        invitedBy: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  /** Resend an invitation (revokes old token, creates new) */
  resendInvite: requireRole("OWNER", "ADMIN").input(
    z.object({ invitationId: z.string() })
  ).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.invitation.findFirst({
      where: { id: input.invitationId, organizationId: ctx.orgId, status: "PENDING" },
    });
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
    }

    // Revoke old
    await ctx.db.invitation.update({
      where: { id: existing.id },
      data: { status: "REVOKED" },
    });

    // Create new with fresh token and expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await ctx.db.invitation.create({
      data: {
        email: existing.email,
        role: existing.role,
        expiresAt,
        invitedById: ctx.userId,
        organizationId: ctx.orgId,
      },
    });

    // Re-send email
    const [inviter, org] = await Promise.all([
      ctx.db.user.findFirst({ where: { supabaseId: ctx.userId }, select: { firstName: true, lastName: true, email: true } }),
      ctx.db.organization.findFirst({ where: { id: ctx.orgId }, select: { name: true, logoUrl: true } }),
    ]);

    const inviterName = inviter?.firstName
      ? `${inviter.firstName}${inviter.lastName ? ` ${inviter.lastName}` : ""}`
      : inviter?.email ?? "Someone";

    const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.token}`;

    const html = await render(
      TeamInviteEmail({
        inviterName,
        orgName: org?.name ?? "your organization",
        role: existing.role,
        acceptUrl,
        logoUrl: org?.logoUrl,
      })
    );

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: existing.email,
      subject: `${inviterName} invited you to join ${org?.name ?? "their organization"} on Pancake`,
      html,
    });

    return { inviteUrl: acceptUrl };
  }),

  /** Revoke a pending invitation */
  revokeInvite: requireRole("OWNER", "ADMIN").input(
    z.object({ invitationId: z.string() })
  ).mutation(async ({ ctx, input }) => {
    const invitation = await ctx.db.invitation.findFirst({
      where: { id: input.invitationId, organizationId: ctx.orgId, status: "PENDING" },
    });
    if (!invitation) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
    }
    return ctx.db.invitation.update({
      where: { id: invitation.id },
      data: { status: "REVOKED" },
    });
  }),

  /** Change a team member's role */
  changeRole: requireRole("OWNER", "ADMIN").input(
    z.object({
      userId: z.string(),
      role: z.enum(["OWNER", "ADMIN", "ACCOUNTANT", "VIEWER"]),
    })
  ).mutation(async ({ ctx, input }) => {
    const targetUser = await ctx.db.user.findFirst({
      where: { id: input.userId, organizationId: ctx.orgId },
    });
    if (!targetUser) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    // Can't change your own role
    if (targetUser.supabaseId === ctx.userId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot change your own role" });
    }

    // Can't demote the last OWNER
    if (targetUser.role === "OWNER" && input.role !== "OWNER") {
      const ownerCount = await ctx.db.user.count({
        where: { organizationId: ctx.orgId, role: "OWNER" },
      });
      if (ownerCount <= 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot demote the last owner" });
      }
    }

    // Only OWNER can promote to OWNER
    if (input.role === "OWNER" && ctx.userRole !== "OWNER") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only owners can promote to owner" });
    }

    return ctx.db.user.update({
      where: { id: input.userId },
      data: { role: input.role },
    });
  }),

  /** Remove a team member */
  removeMember: requireRole("OWNER", "ADMIN").input(
    z.object({ userId: z.string() })
  ).mutation(async ({ ctx, input }) => {
    const targetUser = await ctx.db.user.findFirst({
      where: { id: input.userId, organizationId: ctx.orgId },
    });
    if (!targetUser) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    // Can't remove yourself
    if (targetUser.supabaseId === ctx.userId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot remove yourself" });
    }

    // Can't remove an OWNER (they must transfer/demote first)
    if (targetUser.role === "OWNER") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot remove an owner. Demote them first." });
    }

    // Remove user from org by clearing their organizationId
    // Since organizationId is required, we delete the User record
    // The Supabase auth account remains — they can create a new org or accept another invite
    return ctx.db.user.delete({ where: { id: input.userId } });
  }),

  /** Accept an invitation (called from /invite/[token] page) */
  acceptInvite: protectedProcedure.input(
    z.object({ token: z.string() })
  ).mutation(async ({ ctx, input }) => {
    const invitation = await ctx.db.invitation.findUnique({
      where: { token: input.token },
      include: { organization: { select: { name: true } } },
    });

    if (!invitation) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
    }
    if (invitation.status !== "PENDING") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `This invitation has been ${invitation.status.toLowerCase()}` });
    }
    if (invitation.expiresAt < new Date()) {
      await ctx.db.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
      throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has expired" });
    }

    // Get or create the user record
    const existingUser = await ctx.db.user.findFirst({
      where: { supabaseId: ctx.userId },
    });

    if (existingUser && existingUser.organizationId !== invitation.organizationId) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "You already belong to another organization. Please leave it first.",
      });
    }

    if (existingUser) {
      // User already exists — just update their role if they're already in the org
      await ctx.db.user.update({
        where: { id: existingUser.id },
        data: { role: invitation.role },
      });
    } else {
      // New user — get their info from Supabase
      const supabase = await (await import("@/lib/supabase/server")).createClient();
      const { data: { user } } = await supabase.auth.getUser();

      await ctx.db.user.create({
        data: {
          supabaseId: ctx.userId,
          email: invitation.email,
          firstName: user?.user_metadata?.firstName ?? null,
          lastName: user?.user_metadata?.lastName ?? null,
          role: invitation.role,
          organizationId: invitation.organizationId,
        },
      });
    }

    // Update Supabase app_metadata with the org
    const { createClient: createAdminClient } = await import("@/lib/supabase/admin");
    const adminClient = createAdminClient();
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (authUser) {
      await adminClient.auth.admin.updateUserById(authUser.id, {
        app_metadata: { organizationId: invitation.organizationId },
      });
    }

    // Mark invitation as accepted
    await ctx.db.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED" },
    });

    return { organizationName: invitation.organization.name };
  }),

  /** Validate an invite token (public — used by the invite page before auth) */
  validateToken: publicProcedure.input(
    z.object({ token: z.string() })
  ).query(async ({ ctx, input }) => {
    const invitation = await ctx.db.invitation.findUnique({
      where: { token: input.token },
      include: {
        organization: { select: { name: true, logoUrl: true } },
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (!invitation) return { valid: false as const, reason: "not_found" as const };
    if (invitation.status !== "PENDING") return { valid: false as const, reason: invitation.status.toLowerCase() as "accepted" | "expired" | "revoked" };
    if (invitation.expiresAt < new Date()) return { valid: false as const, reason: "expired" as const };

    return {
      valid: true as const,
      email: invitation.email,
      role: invitation.role,
      orgName: invitation.organization.name,
      orgLogoUrl: invitation.organization.logoUrl,
      inviterName: invitation.invitedBy.firstName
        ? `${invitation.invitedBy.firstName}${invitation.invitedBy.lastName ? ` ${invitation.invitedBy.lastName}` : ""}`
        : "Someone",
    };
  }),
});
```

**Step 3: Register the router**

Find the file that merges routers (likely `src/server/routers/index.ts` or `src/server/root.ts`). Add:

```typescript
import { teamRouter } from "./routers/team";
```

And add `team: teamRouter` to the router object.

**Step 4: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/server/routers/team.ts src/server/routers/index.ts
git commit -m "feat: add team tRPC router with invite, role, and member management"
```

---

### Task 5: Create Invite Acceptance Page

**Files:**
- Create: `src/app/invite/[token]/page.tsx`

**Step 1: Create the invite acceptance page**

This is a public page (outside the `(dashboard)` layout). Create `src/app/invite/[token]/page.tsx`:

```tsx
import { api } from "@/trpc/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteAcceptClient } from "./InviteAcceptClient";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Validate the token
  const result = await api.team.validateToken({ token });

  if (!result.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full mx-4">
          <div className="rounded-2xl border border-border/50 bg-card p-8 text-center">
            <h1 className="text-xl font-bold mb-2">Invalid Invitation</h1>
            <p className="text-sm text-muted-foreground">
              {result.reason === "not_found" && "This invitation link is invalid."}
              {result.reason === "expired" && "This invitation has expired. Ask the sender to resend it."}
              {result.reason === "accepted" && "This invitation has already been accepted."}
              {result.reason === "revoked" && "This invitation has been revoked."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Check if user is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Not logged in — redirect to sign-in with redirect back
    redirect(`/sign-in?redirect=/invite/${token}`);
  }

  // User is authenticated — show accept UI
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4">
        <InviteAcceptClient
          token={token}
          orgName={result.orgName}
          orgLogoUrl={result.orgLogoUrl}
          inviterName={result.inviterName}
          role={result.role}
        />
      </div>
    </div>
  );
}
```

**Step 2: Create the client component**

Create `src/app/invite/[token]/InviteAcceptClient.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

type Props = {
  token: string;
  orgName: string;
  orgLogoUrl?: string | null;
  inviterName: string;
  role: string;
};

export function InviteAcceptClient({ token, orgName, orgLogoUrl, inviterName, role }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const acceptMutation = api.team.acceptInvite.useMutation({
    onSuccess: () => {
      // Refresh to pick up new JWT with organizationId
      router.push("/");
      router.refresh();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const roleName = role.charAt(0) + role.slice(1).toLowerCase();

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-8 text-center">
      {orgLogoUrl && (
        <img src={orgLogoUrl} alt={orgName} className="h-12 w-auto mx-auto mb-4" />
      )}
      <h1 className="text-xl font-bold mb-2">Join {orgName}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {inviterName} invited you to join as {role === "ADMIN" ? "an" : "a"} <strong>{roleName}</strong>.
      </p>

      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}

      <button
        onClick={() => acceptMutation.mutate({ token })}
        disabled={acceptMutation.isPending}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {acceptMutation.isPending ? "Joining..." : "Accept Invitation"}
      </button>
    </div>
  );
}
```

**Step 3: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/invite/
git commit -m "feat: add invite acceptance page with token validation"
```

---

### Task 6: Create Team Settings Page

**Files:**
- Create: `src/app/(dashboard)/settings/team/page.tsx`

**Step 1: Create the team management page**

Create `src/app/(dashboard)/settings/team/page.tsx`:

```tsx
import { api } from "@/trpc/server";
import { redirect } from "next/navigation";
import { InviteForm } from "@/components/team/InviteForm";
import { TeamMemberList } from "@/components/team/TeamMemberList";
import { PendingInvitationList } from "@/components/team/PendingInvitationList";

export default async function TeamSettingsPage() {
  const [members, pendingInvites, org] = await Promise.all([
    api.team.list(),
    api.team.pendingInvites().catch(() => []), // Fails for non-Owner/Admin — show empty
    api.organization.get(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage team members and invitations for {org.name}.
        </p>
      </div>

      {/* Invite form — Owner/Admin only, handled by client component */}
      <InviteForm />

      {/* Pending invitations */}
      {pendingInvites.length > 0 && (
        <PendingInvitationList invitations={pendingInvites} />
      )}

      {/* Current members */}
      <TeamMemberList members={members} />
    </div>
  );
}
```

**Step 2: Create InviteForm component**

Create `src/components/team/InviteForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import { Copy } from "lucide-react";

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "ACCOUNTANT" | "VIEWER">("VIEWER");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const utils = api.useUtils();
  const inviteMutation = api.team.invite.useMutation({
    onSuccess: (data) => {
      toast.success("Invitation sent!");
      setInviteUrl(data.inviteUrl);
      setEmail("");
      utils.team.pendingInvites.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <h2 className="text-sm font-semibold mb-4">Invite a Team Member</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setInviteUrl(null);
          inviteMutation.mutate({ email, role });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="invite-email" className="text-xs text-muted-foreground font-medium">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@example.com"
            className="mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="invite-role" className="text-xs text-muted-foreground font-medium">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="ADMIN">Admin</option>
            <option value="ACCOUNTANT">Accountant</option>
            <option value="VIEWER">Viewer</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={inviteMutation.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {inviteMutation.isPending ? "Sending..." : "Send Invite"}
        </button>
      </form>
      {inviteUrl && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Or share this link:</span>
          <code className="bg-muted px-2 py-1 rounded text-[11px] truncate max-w-[300px]">{inviteUrl}</code>
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success("Link copied!"); }}
            className="shrink-0 hover:text-foreground transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create TeamMemberList component**

Create `src/components/team/TeamMemberList.tsx`:

```tsx
"use client";

import { api } from "@/trpc/react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useState } from "react";

type Member = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  createdAt: Date;
};

export function TeamMemberList({ members: initialMembers }: { members: Member[] }) {
  const { data: members } = api.team.list.useQuery(undefined, {
    initialData: initialMembers,
  });
  const [removingId, setRemovingId] = useState<string | null>(null);

  const utils = api.useUtils();

  const changeRoleMutation = api.team.changeRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      utils.team.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = api.team.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed");
      setRemovingId(null);
      utils.team.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50">
        <p className="text-sm font-semibold">Team Members</p>
        <p className="text-xs text-muted-foreground mt-0.5">{members.length} members</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40">
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Joined</th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {members.map((m) => (
            <tr key={m.id} className="hover:bg-accent/20 transition-colors">
              <td className="px-6 py-3.5 font-medium">
                {m.firstName || m.lastName
                  ? `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim()
                  : "—"}
              </td>
              <td className="px-6 py-3.5 text-muted-foreground">{m.email}</td>
              <td className="px-6 py-3.5">
                <select
                  value={m.role}
                  onChange={(e) => changeRoleMutation.mutate({ userId: m.id, role: e.target.value as "OWNER" | "ADMIN" | "ACCOUNTANT" | "VIEWER" })}
                  className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="OWNER">Owner</option>
                  <option value="ADMIN">Admin</option>
                  <option value="ACCOUNTANT">Accountant</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </td>
              <td className="px-6 py-3.5 text-muted-foreground text-xs">
                {new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </td>
              <td className="px-6 py-3.5 text-right">
                {m.role !== "OWNER" && (
                  <button
                    type="button"
                    onClick={() => setRemovingId(m.id)}
                    className="text-xs text-destructive hover:text-destructive/80 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {removingId && (
        <ConfirmDialog
          title="Remove team member?"
          description="This person will lose access to the organization. They can be re-invited later."
          confirmLabel="Remove"
          onConfirm={() => removeMutation.mutate({ userId: removingId })}
          onCancel={() => setRemovingId(null)}
          isLoading={removeMutation.isPending}
        />
      )}
    </div>
  );
}
```

**Step 4: Create PendingInvitationList component**

Create `src/components/team/PendingInvitationList.tsx`:

```tsx
"use client";

import { api } from "@/trpc/react";
import { toast } from "sonner";

type Invitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  invitedBy: { firstName: string | null; lastName: string | null; email: string };
};

export function PendingInvitationList({ invitations: initial }: { invitations: Invitation[] }) {
  const { data: invitations } = api.team.pendingInvites.useQuery(undefined, {
    initialData: initial,
  });
  const utils = api.useUtils();

  const resendMutation = api.team.resendInvite.useMutation({
    onSuccess: () => {
      toast.success("Invitation resent!");
      utils.team.pendingInvites.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeMutation = api.team.revokeInvite.useMutation({
    onSuccess: () => {
      toast.success("Invitation revoked");
      utils.team.pendingInvites.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!invitations || invitations.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50">
        <p className="text-sm font-semibold">Pending Invitations</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40">
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expires</th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {invitations.map((inv) => (
            <tr key={inv.id} className="hover:bg-accent/20 transition-colors">
              <td className="px-6 py-3.5 font-medium">{inv.email}</td>
              <td className="px-6 py-3.5 text-muted-foreground">
                {inv.role.charAt(0) + inv.role.slice(1).toLowerCase()}
              </td>
              <td className="px-6 py-3.5 text-muted-foreground text-xs">
                {new Date(inv.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </td>
              <td className="px-6 py-3.5 text-right space-x-2">
                <button
                  type="button"
                  onClick={() => resendMutation.mutate({ invitationId: inv.id })}
                  disabled={resendMutation.isPending}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  Resend
                </button>
                <button
                  type="button"
                  onClick={() => revokeMutation.mutate({ invitationId: inv.id })}
                  disabled={revokeMutation.isPending}
                  className="text-xs text-destructive hover:text-destructive/80 transition-colors"
                >
                  Revoke
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 5: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/app/\(dashboard\)/settings/team/ src/components/team/
git commit -m "feat: add team settings page with invite form, member list, and pending invitations"
```

---

### Task 7: Add Team Link to Settings Navigation and Sidebar

**Files:**
- Modify: `src/components/layout/SidebarNav.tsx`
- Modify: Settings page (if there's a settings nav/layout)

**Step 1: Read the sidebar**

Read `src/components/layout/SidebarNav.tsx` to see the current nav structure.

**Step 2: Add Team link**

Add `Users` to the lucide-react import. Add a "Team" entry to the `secondaryNav` array (or wherever Settings sub-links are):

```typescript
{ href: "/settings/team", label: "Team", icon: <Users className="w-4 h-4" /> },
```

**Step 3: Read the settings page**

Check if there's a settings index page or layout that lists sub-pages. If so, add a "Team" card/link there too.

**Step 4: Verify build**

Run: `npx next build 2>&1 | tail -20`

**Step 5: Commit**

```bash
git add src/components/layout/SidebarNav.tsx
git commit -m "feat: add Team link to sidebar navigation"
```

---

### Task 8: Add Role Guards to Existing Routers

**Files:**
- Modify: `src/server/routers/invoices.ts`
- Modify: `src/server/routers/clients.ts`
- Modify: `src/server/routers/projects.ts`
- Modify: `src/server/routers/expenses.ts`
- Modify: `src/server/routers/taxes.ts`
- Modify: `src/server/routers/organization.ts`
- Modify: All other routers with write operations

**Step 1: Read each router file**

For each router, identify which procedures are read-only (queries) and which are write operations (mutations).

**Step 2: Apply requireRole guards**

Import `requireRole` from `../trpc` in each router. Apply the permissions matrix:

- **Invoices, Clients, Projects**: `list`/`getById` stay as `protectedProcedure`. `create`/`update`/`delete`/`send` change to `requireRole("OWNER", "ADMIN")`.
- **Payments**: Recording payments → `requireRole("OWNER", "ADMIN", "ACCOUNTANT")`
- **Expenses**: CRUD → `requireRole("OWNER", "ADMIN", "ACCOUNTANT")`
- **Reports**: All stay as `protectedProcedure` (all roles can view)
- **Taxes/Settings**: Write operations → `requireRole("OWNER", "ADMIN")`
- **Organization**: Delete/transfer → `requireRole("OWNER")`

The pattern for each router is:
1. Add `requireRole` to the import from `../trpc`
2. Replace `protectedProcedure` with `requireRole(...)` on mutation procedures
3. Leave query procedures as `protectedProcedure`

**Step 3: Verify build**

Run: `npx next build 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add src/server/routers/
git commit -m "feat: add requireRole guards to all routers per RBAC permissions matrix"
```

---

### Task 9: Update Sign-In/Sign-Up for Invite Redirects

**Files:**
- Modify: `src/app/(auth)/sign-in/page.tsx`
- Modify: `src/app/(auth)/sign-up/page.tsx`
- Modify: `src/app/auth/callback/route.ts`

**Step 1: Read the sign-in page**

Read `src/app/(auth)/sign-in/page.tsx` to understand the current auth flow.

**Step 2: Support redirect param**

Both sign-in and sign-up pages should read a `redirect` search param from the URL and pass it through the auth flow. After successful auth, redirect to that URL instead of the default dashboard.

In the sign-in page, after successful sign-in:
```typescript
const redirect = searchParams.get("redirect");
router.push(redirect ?? "/");
```

In the sign-up page, include the redirect in `emailRedirectTo`:
```typescript
const redirect = searchParams.get("redirect");
const emailRedirectTo = `${window.location.origin}/auth/callback${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`;
```

**Step 3: Update auth callback**

In `src/app/auth/callback/route.ts`, read the `redirect` query param and use it instead of the default redirect:

```typescript
const redirect = request.nextUrl.searchParams.get("redirect");
// ... after successful auth ...
return NextResponse.redirect(new URL(redirect ?? "/", request.url));
```

**Step 4: Update onboarding to skip for invite users**

In the middleware or onboarding page, check if the user has an `organizationId` in their app_metadata (set by acceptInvite). If they do, don't redirect to onboarding.

**Step 5: Verify build**

Run: `npx next build 2>&1 | tail -20`

**Step 6: Commit**

```bash
git add src/app/\(auth\)/ src/app/auth/
git commit -m "feat: support redirect param in auth flow for invite acceptance"
```

---

### Task 10: Update Onboarding to Set OWNER Role

**Files:**
- Modify: `src/app/api/onboarding/create-org/route.ts`

**Step 1: Read the onboarding route**

Read `src/app/api/onboarding/create-org/route.ts`.

**Step 2: Set role to OWNER for org creators**

When creating the User record in the onboarding flow, ensure `role: "OWNER"` is set:

```typescript
await db.user.upsert({
  where: { ... },
  create: {
    ...
    role: "OWNER",  // Org creator is always OWNER
  },
  update: { ... },
});
```

**Step 3: Verify build and commit**

```bash
git add src/app/api/onboarding/
git commit -m "feat: set OWNER role for org creators during onboarding"
```

---

### Task 11: Fix Any References to Old STAFF Role

**Files:**
- Search entire codebase for `STAFF` references

**Step 1: Search for STAFF**

Run: Search for `STAFF` across all `.ts` and `.tsx` files. Replace any `UserRole.STAFF` or `"STAFF"` references with the appropriate new role (usually `"ADMIN"` or `"VIEWER"` depending on context).

**Step 2: Verify build**

Run: `npx next build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add -A
git commit -m "fix: replace STAFF role references with updated role values"
```

---

### Task 12: Smoke Test

**Step 1: Start dev server**

Run: `npx next dev`

**Step 2: Verify team settings**

Navigate to `/settings/team`:
- Invite form visible
- Member list shows current user as OWNER
- Can send invite (check email delivery)
- Copy invite link works

**Step 3: Test invite flow**

- Open invite link in incognito
- Verify redirect to sign-in/sign-up
- After auth, verify accept button works
- Verify new user appears in team list

**Step 4: Test role guards**

- Change a member's role to Viewer
- Log in as that user
- Verify they can view reports but can't create invoices

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address smoke test issues in team invitations"
```
