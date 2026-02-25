# Plan: Multi-Organization Support

**Goal:** Allow a single user account to belong to and switch between multiple organizations.

**Status:** Planned — not started

---

## Background

The current architecture stores `organizationId` as a single string in Supabase `app_metadata`, and the `User` model has a direct non-nullable FK to `Organization`. Every tRPC procedure already filters by `ctx.orgId` consistently — this is a significant architectural win that means none of the 30+ business logic procedures need changes.

---

## Changes Required

### 1. Database Schema

**Add `UserOrganization` join table:**

```prisma
model UserOrganization {
  userId         String
  organizationId String
  role           UserRole @default(STAFF)
  createdAt      DateTime @default(now())

  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@id([userId, organizationId])
}
```

**Modify `User` model:**
- Make `User.organizationId` nullable (or drop it after migration)
- Move `UserRole` from `User` to `UserOrganization` (role becomes per-org)
- Add `organizations UserOrganization[]` relation

**Migration SQL (manual via Supabase dashboard):**
```sql
-- 1. Create join table
CREATE TABLE "UserOrganization" (
  "userId"         TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "role"           TEXT NOT NULL DEFAULT 'STAFF',
  "createdAt"      TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("userId", "organizationId"),
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

-- 2. Migrate existing data
INSERT INTO "UserOrganization" ("userId", "organizationId", "role")
SELECT "id", "organizationId", "role"
FROM "User"
WHERE "organizationId" IS NOT NULL;

-- 3. Make User.organizationId nullable (defer dropping until stable)
ALTER TABLE "User" ALTER COLUMN "organizationId" DROP NOT NULL;
```

---

### 2. Supabase app_metadata Shape

**Current:**
```json
{ "organizationId": "org_xyz" }
```

**New:**
```json
{ "organizationIds": ["org_abc", "org_xyz"] }
```

Update all three auth flows that write `app_metadata`:
- `src/app/auth/callback/route.ts`
- `src/app/api/auth/migrate/route.ts`
- `src/app/api/onboarding/create-org/route.ts`

Each should append to the array rather than overwrite:
```ts
const existing = user.app_metadata?.organizationIds as string[] ?? [];
await admin.auth.admin.updateUserById(supabaseId, {
  app_metadata: { organizationIds: [...new Set([...existing, newOrgId])] }
});
```

---

### 3. Active Org — Server Cookie

Use a server-set cookie `active-org-id` to track which org is currently active.

**New route: `POST /api/org/switch`**
```ts
// Validate user belongs to requested org, then:
cookies().set('active-org-id', orgId, { httpOnly: true, path: '/' });
return redirect('/');
```

---

### 4. tRPC Context (`src/server/trpc.ts`)

```ts
export const createTRPCContext = async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const userId = user?.id ?? null;
  const orgIds = (user?.app_metadata?.organizationIds as string[]) ?? [];

  // Read active org from cookie, fallback to first org
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get('active-org-id')?.value ?? null;
  const orgId = activeOrgId && orgIds.includes(activeOrgId)
    ? activeOrgId
    : orgIds[0] ?? null;

  return { db, userId, orgId };
};
```

All 30+ procedures using `ctx.orgId` — **no changes needed**.

---

### 5. Middleware (`src/middleware.ts`)

```ts
// Before: single string check
const organizationId = user.app_metadata?.organizationId;
if (!organizationId && pathname !== "/onboarding") redirect("/onboarding");

// After: array check
const organizationIds = user.app_metadata?.organizationIds as string[] ?? [];
if (organizationIds.length === 0 && pathname !== "/onboarding") redirect("/onboarding");
```

---

### 6. Onboarding (`src/app/api/onboarding/create-org/route.ts`)

Remove or relax the gate that prevents creating an org if one already exists. After migration, users with existing orgs should be allowed to create additional ones through an explicit in-app flow (not just first-run onboarding).

Consider a dedicated "Create Organization" page/modal separate from the onboarding flow.

---

### 7. UI — Org Switcher

Add an org switcher to the dashboard sidebar/header.

**Location:** `src/app/(dashboard)/layout.tsx` — replace single org name display with switcher dropdown.

**Data needed:** Fetch all orgs the user belongs to. Options:
- New tRPC procedure `orgs.list` — returns all orgs for current user from `UserOrganization`
- Or derive from `app_metadata.organizationIds` + org name lookups

**Behavior:**
1. Dropdown shows all orgs, active one checked/highlighted
2. Selecting an org calls `POST /api/org/switch`
3. Page refreshes with new active org context

---

## Files to Change

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `UserOrganization`, update `User` |
| `prisma/migrations/...` | New migration file + manual SQL |
| `src/server/trpc.ts` | Read active org from cookie |
| `src/middleware.ts` | Check array instead of single string |
| `src/app/auth/callback/route.ts` | Write to `organizationIds` array |
| `src/app/api/auth/migrate/route.ts` | Write to `organizationIds` array |
| `src/app/api/onboarding/create-org/route.ts` | Append to array, remove single-org gate |
| `src/app/(dashboard)/layout.tsx` | Add org switcher component |
| `src/server/routers/orgs.ts` | New router — `list`, maybe `create` |
| `src/app/api/org/switch/route.ts` | New route — set active-org-id cookie |
| `src/components/layout/OrgSwitcher.tsx` | New component |

## Files NOT Changing

- All tRPC routers (`clients`, `invoices`, `projects`, `time`, etc.) — `ctx.orgId` already correct
- All portal routes — token-based, org-agnostic
- Stripe webhook — resolves org from invoice, not from user session

---

## Sequencing

1. **DB migration** — add join table, migrate data, make FK nullable (manual SQL in Supabase dashboard)
2. **Prisma schema** — reflect new model, run `prisma generate`
3. **app_metadata** — update all 3 auth flows to write arrays
4. **tRPC context** — switch to cookie-based active org
5. **Middleware** — update org check to array
6. **API route** — `POST /api/org/switch`
7. **tRPC router** — `orgs.list`
8. **UI** — org switcher component in dashboard layout
9. **Onboarding** — update gate logic

Steps 1–5 are the critical path and must be done together (they're interdependent). Steps 6–9 can follow independently.

---

## Risks / Notes

- **Existing users:** All current users have a single org. The join table migration handles this — they'll continue working with one org until they create/join another.
- **JWT staleness:** After adding a user to a new org, `app_metadata` update requires a JWT refresh before it's visible in the session. The `supabase-jwt-stale-after-metadata-update` skill covers this pattern.
- **`User.organizationId` column:** Keep nullable (don't drop) until confident all code paths use the join table. Can drop in a follow-up migration.
- **Role model:** `UserRole` currently on `User` is not enforced in tRPC. Moving it to `UserOrganization` is correct but means updating the `protectedProcedure` guard if/when role enforcement is added.
