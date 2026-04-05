# Multi-Organization Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to belong to multiple organizations and switch between them via a sidebar dropdown.

**Architecture:** Replace the direct `User.organizationId` FK with a `UserOrganization` join table. Store the active org in a cookie. Update tRPC context to read from cookie + validate membership. Replace the static OrgBadge with an interactive OrgSwitcher dropdown.

**Tech Stack:** Prisma 7, tRPC v11, Next.js cookies, shadcn DropdownMenu

---

## Task 1: Schema — Create UserOrganization join table

Add the new model and update User to remove `organizationId` and `role`. This is the foundation everything else depends on.

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add UserOrganization model to schema**

Read `prisma/schema.prisma`. Add after the User model:

```prisma
model UserOrganization {
  id             String       @id @default(cuid())
  userId         String
  organizationId String
  role           UserRole     @default(ADMIN)
  createdAt      DateTime     @default(now())

  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([userId, organizationId])
}
```

Add `memberships UserOrganization[]` relation to the `User` model.
Add `members UserOrganization[]` relation to the `Organization` model (keep the existing `users User[]` temporarily for the migration).

**Step 2: Create migration (schema only, don't remove User fields yet)**

Run: `npx prisma migrate dev --create-only --name add-user-organization-table`
Run: `npx prisma generate`

**Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/generated/prisma/
git commit -m "feat: add UserOrganization join table for multi-org support"
```

---

## Task 2: Data migration — Populate UserOrganization from existing User data

Create a migration script that copies `userId`, `organizationId`, `role` from User into UserOrganization.

**Files:**
- Create: `prisma/migrations/<timestamp>_populate_user_organization/migration.sql`

**Step 1: Create the SQL migration**

```sql
-- Populate UserOrganization from existing User data
INSERT INTO "UserOrganization" ("id", "userId", "organizationId", "role", "createdAt")
SELECT gen_random_uuid(), "id", "organizationId", "role", NOW()
FROM "User"
WHERE "organizationId" IS NOT NULL
ON CONFLICT ("userId", "organizationId") DO NOTHING;
```

Since DB is unreachable from local, create this as a manual migration file. Also provide the SQL to the user to run in Supabase SQL Editor.

**Step 2: Commit**

```bash
git add prisma/migrations/
git commit -m "feat: data migration to populate UserOrganization from existing User data"
```

---

## Task 3: Update tRPC context — Read active org from cookie

Change the tRPC context to read `activeOrgId` from a cookie, validate membership via the join table, and set `ctx.orgId` and `ctx.userRole`.

**Files:**
- Modify: `src/server/trpc.ts`

**Step 1: Update createTRPCContext**

Read `src/server/trpc.ts`. Replace the current context creation:

```ts
import { initTRPC, TRPCError } from "@trpc/server";
import { getUser } from "@/lib/supabase/server";
import { db } from "./db";
import superjson from "superjson";
import { ZodError } from "zod";
import type { UserRole } from "@/generated/prisma";
import { cookies } from "next/headers";

export const createTRPCContext = async () => {
  const { data: { user } } = await getUser();
  const userId = user?.id ?? null;

  let orgId: string | null = null;
  let userRole: UserRole | null = null;

  if (userId) {
    // Read active org from cookie
    const cookieStore = await cookies();
    const activeOrgId = cookieStore.get("activeOrgId")?.value ?? null;

    if (activeOrgId) {
      // Validate membership
      const membership = await db.userOrganization.findUnique({
        where: { userId_organizationId: { userId, organizationId: activeOrgId } },
      });
      // Find by supabaseId since userId in context is the Supabase ID
      // The User table has supabaseId, UserOrganization has userId (our internal ID)
    }

    // Look up our internal User record
    const dbUser = await db.user.findFirst({
      where: { supabaseId: userId },
      select: { id: true },
    });

    if (dbUser) {
      if (activeOrgId) {
        const membership = await db.userOrganization.findUnique({
          where: { userId_organizationId: { userId: dbUser.id, organizationId: activeOrgId } },
          select: { role: true, organizationId: true },
        });
        if (membership) {
          orgId = membership.organizationId;
          userRole = membership.role;
        }
      }

      // Fallback: if no cookie or invalid, use first membership
      if (!orgId) {
        const firstMembership = await db.userOrganization.findFirst({
          where: { userId: dbUser.id },
          select: { role: true, organizationId: true },
          orderBy: { createdAt: "asc" },
        });
        if (firstMembership) {
          orgId = firstMembership.organizationId;
          userRole = firstMembership.role;
        }
      }

      // Legacy fallback: if UserOrganization is empty (migration not yet run),
      // fall back to app_metadata
      if (!orgId) {
        orgId = (user?.app_metadata?.organizationId as string) ?? null;
        userRole = (user?.app_metadata?.userRole as UserRole) ?? null;
      }
    }
  }

  return { db, userId, orgId, userRole };
};
```

IMPORTANT: `ctx.userId` is the Supabase UUID, but `UserOrganization.userId` points to `User.id` (our internal cuid). We need to look up the internal User first.

**Step 2: Update protectedProcedure**

The `protectedProcedure` currently checks `user.organizationId` — update to check membership via join table:

```ts
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId || !ctx.orgId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  // Check if user account is suspended
  try {
    const dbUser = await ctx.db.user.findFirst({
      where: { supabaseId: ctx.userId },
      select: { isActive: true },
    });
    if (dbUser && !dbUser.isActive) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been suspended." });
    }
  } catch (e) {
    if (e instanceof TRPCError) throw e;
  }

  return next({ ctx: { ...ctx, userId: ctx.userId, orgId: ctx.orgId, userRole: ctx.userRole } });
});
```

**Step 3: Type-check and test**

Run: `npx tsc --noEmit 2>&1 | grep "trpc.ts" | head -5`
Run: `npx vitest run`

**Step 4: Commit**

```bash
git add src/server/trpc.ts
git commit -m "feat: tRPC context reads active org from cookie with membership validation"
```

---

## Task 4: Organizations router — switchOrg and listMyOrgs

Create the API for listing orgs and switching the active one.

**Files:**
- Create: `src/server/routers/organizations-multi.ts` (or add to existing `organization.ts`)
- Modify: `src/server/routers/_app.ts`

**Step 1: Read the existing organization router**

Read `src/server/routers/organization.ts` to understand what's there. Add the new procedures to it.

**Step 2: Add listMyOrgs and switchOrg**

```ts
listMyOrgs: protectedProcedure.query(async ({ ctx }) => {
  const dbUser = await ctx.db.user.findFirst({
    where: { supabaseId: ctx.userId },
    select: { id: true },
  });
  if (!dbUser) return [];

  return ctx.db.userOrganization.findMany({
    where: { userId: dbUser.id },
    include: {
      organization: {
        select: { id: true, name: true, logoUrl: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}),

switchOrg: protectedProcedure
  .input(z.object({ orgId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const dbUser = await ctx.db.user.findFirst({
      where: { supabaseId: ctx.userId },
      select: { id: true },
    });
    if (!dbUser) throw new TRPCError({ code: "NOT_FOUND" });

    const membership = await ctx.db.userOrganization.findUnique({
      where: {
        userId_organizationId: { userId: dbUser.id, organizationId: input.orgId },
      },
      include: { organization: { select: { id: true, name: true } } },
    });

    if (!membership) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization" });
    }

    // Set the cookie
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    cookieStore.set("activeOrgId", input.orgId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    return membership;
  }),
```

**Step 3: Type-check and commit**

```bash
git add src/server/routers/organization.ts
git commit -m "feat: add listMyOrgs and switchOrg procedures for multi-org"
```

---

## Task 5: OrgSwitcher UI component

Replace the static `OrgBadge` in the sidebar with an interactive org switcher dropdown.

**Files:**
- Create: `src/components/layout/OrgSwitcher.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Step 1: Create OrgSwitcher component**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";

export function OrgSwitcher({ currentOrgId }: { currentOrgId: string }) {
  const router = useRouter();
  const { data: orgs } = trpc.organization.listMyOrgs.useQuery();
  const switchOrg = trpc.organization.switchOrg.useMutation({
    onSuccess: () => router.refresh(),
  });

  const currentOrg = orgs?.find((m) => m.organizationId === currentOrgId);

  return (
    <div className="mt-auto pt-3 border-t border-sidebar-border">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-sidebar-accent w-full hover:bg-sidebar-accent/80 transition-colors text-left">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0 text-[11px] font-bold text-primary-foreground shadow-sm">
              {currentOrg?.organization.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <span className="text-xs text-sidebar-foreground/70 font-medium truncate flex-1">
              {currentOrg?.organization.name ?? "Select org"}
            </span>
            <ChevronsUpDown className="w-3 h-3 text-sidebar-foreground/40 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {orgs?.map((membership) => (
            <DropdownMenuItem
              key={membership.organizationId}
              onClick={() => {
                if (membership.organizationId !== currentOrgId) {
                  switchOrg.mutate({ orgId: membership.organizationId });
                }
              }}
              className="flex items-center gap-2"
            >
              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                {membership.organization.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{membership.organization.name}</p>
                <p className="text-[10px] text-muted-foreground">{membership.role}</p>
              </div>
              {membership.organizationId === currentOrgId && (
                <Check className="w-3.5 h-3.5 text-primary shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/onboarding" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create New Organization
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

**Step 2: Replace OrgBadge in layout**

Read `src/app/(dashboard)/layout.tsx`. Replace the `OrgBadge` async component with a server component that passes `currentOrgId` to the client `OrgSwitcher`:

```tsx
import { OrgSwitcher } from "@/components/layout/OrgSwitcher";

async function OrgSwitcherSection() {
  const { data: { user } } = await getUser();
  const orgId = (user?.app_metadata?.organizationId as string) ?? "";
  // Also try the cookie
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("activeOrgId")?.value ?? orgId;
  return <OrgSwitcher currentOrgId={activeOrgId} />;
}
```

Replace `<OrgBadge />` with `<OrgSwitcherSection />` in both desktop sidebar and mobile nav.

**Step 3: Type-check and commit**

```bash
git add src/components/layout/OrgSwitcher.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "feat: add OrgSwitcher dropdown to sidebar for multi-org navigation"
```

---

## Task 6: Update onboarding — Allow creating additional orgs

Remove the guard that blocks users who already have an org.

**Files:**
- Modify: `src/app/api/onboarding/create-org/route.ts`

**Step 1: Read and update**

Read the file. Remove or modify the early return at line ~17 that checks `if (user.app_metadata?.organizationId)`.

After creating the org and User record, also create a `UserOrganization` membership:

```ts
await db.userOrganization.create({
  data: {
    userId: newUser.id, // or existingUser.id
    organizationId: org.id,
    role: "OWNER",
  },
});
```

Set the `activeOrgId` cookie to the new org.

**Step 2: Commit**

```bash
git add src/app/api/onboarding/create-org/route.ts
git commit -m "feat: allow creating additional organizations from onboarding"
```

---

## Task 7: Update invite flow — Allow cross-org membership

Remove the single-org guards from the team router.

**Files:**
- Modify: `src/server/routers/team.ts`

**Step 1: Read and update**

Read `src/server/routers/team.ts`. Find and modify:

1. The guard at ~line 52 that says `"This person already belongs to another organization"` — remove it or change to check if they're already in *this specific org*

2. The `acceptInvite` guard at ~line 406 that checks `existingUser.organizationId !== invitation.organizationId` — remove it

3. The `acceptInvite` logic that updates `User.organizationId` — replace with creating a `UserOrganization` row:

```ts
await ctx.db.userOrganization.create({
  data: {
    userId: existingUser.id,
    organizationId: invitation.organizationId,
    role: invitation.role,
  },
});
```

4. Set the `activeOrgId` cookie to the invited org.

**Step 2: Commit**

```bash
git add src/server/routers/team.ts
git commit -m "feat: allow users to accept invites to additional organizations"
```

---

## Task 8: Update broken references — 9 files

Update all files that directly read `User.role` or `User.organizationId` to use the `UserOrganization` join table instead.

**Files to update:**
1. `src/server/services/email-bcc.ts` — change `users: { where: { role: "OWNER" } }` to `members: { where: { role: "OWNER" }, include: { user: { select: { email: true } } } }`
2. `src/server/services/notifications.ts` — same pattern for ADMIN lookup
3. `src/server/routers/portal.ts` — update org.users queries to org.members
4. `src/app/portal/[token]/layout.tsx` — same
5. `src/server/services/recurring-expense-generator.ts` — update User.findFirst to join through UserOrganization
6. `src/app/auth/callback/route.ts` — read role/orgId from UserOrganization instead of User
7. `src/app/api/auth/migrate/route.ts` — same
8. `src/app/api/onboarding/create-org/route.ts` — already handled in Task 6

**Step 1: Update each file**

For files that query `organization.users` with role filters, the pattern changes from:
```ts
users: { where: { role: "OWNER" }, select: { email: true } }
```
to:
```ts
members: { where: { role: "OWNER" }, include: { user: { select: { email: true } } } }
```

Then adjust the result access from `org.users[0].email` to `org.members[0]?.user.email`.

**Step 2: Type-check and test**

Run: `npx tsc --noEmit`
Run: `npx vitest run`

**Step 3: Commit**

```bash
git add src/server/services/email-bcc.ts \
  src/server/services/notifications.ts \
  src/server/routers/portal.ts \
  "src/app/portal/[token]/layout.tsx" \
  src/server/services/recurring-expense-generator.ts \
  src/app/auth/callback/route.ts \
  src/app/api/auth/migrate/route.ts
git commit -m "refactor: update all User.role/organizationId references to use UserOrganization"
```

---

## Task 9: Remove User.organizationId and User.role from schema

Now that all code references are updated, remove the old columns.

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Remove fields**

Remove from the User model:
- `role UserRole @default(ADMIN)`
- `organizationId String`
- `organization Organization @relation(...)`

Keep the `users User[]` relation on Organization for now — it can be removed later after verifying nothing uses it.

**Step 2: Create migration**

```sql
ALTER TABLE "User" DROP COLUMN "role";
ALTER TABLE "User" DROP COLUMN "organizationId";
```

**Step 3: Regenerate and test**

Run: `npx prisma generate`
Run: `npx tsc --noEmit`
Run: `npx vitest run`

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/generated/prisma/
git commit -m "refactor: remove User.organizationId and User.role — fully migrated to UserOrganization"
```

---

## Final Verification

1. Run full test suite: `npx vitest run`
2. Run type-check: `npx tsc --noEmit`
3. Manual test:
   - Log in → see org switcher in sidebar
   - Click "Create New Organization" → create second org
   - Switch between orgs → data changes (invoices, clients, etc.)
   - Invite a user to org 2 → they can accept and switch
4. Run migrations on production DB before deploying
