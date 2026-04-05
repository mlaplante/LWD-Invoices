# Multi-Organization Support Design

**Goal:** Allow a single user to own/belong to multiple organizations and switch between them instantly via a sidebar dropdown.

## Schema Changes

### New `UserOrganization` join table

Replaces the direct `User.organizationId` FK with a many-to-many relationship:

```
UserOrganization
  - id: String @id @default(cuid())
  - userId: String → User
  - organizationId: String → Organization
  - role: UserRole (OWNER, ADMIN, MEMBER)
  - createdAt: DateTime @default(now())
  - @@unique([userId, organizationId])
```

### Migration strategy

1. Create `UserOrganization` table
2. Migrate existing data: `INSERT INTO "UserOrganization" ("id", "userId", "organizationId", "role", "createdAt") SELECT gen_random_uuid(), id, "organizationId", role, NOW() FROM "User" WHERE "organizationId" IS NOT NULL`
3. Drop `organizationId` and `role` columns from `User` table
4. Update all references from `User.organizationId` / `User.role` to join through `UserOrganization`

## Auth & Context

Active org stored in a **cookie** (`activeOrgId`, httpOnly, secure, sameSite=lax).

tRPC context (`src/server/trpc.ts`):
- Read `activeOrgId` from cookie
- If not set, fall back to user's first org membership
- Validate user has a `UserOrganization` record for that org
- Set `ctx.orgId` and `ctx.userRole` from the membership record
- If invalid membership, return 403

Middleware unchanged — still checks Supabase auth. Cookie is read by tRPC context only.

## Org Switching

### API

New tRPC mutation `organizations.switchOrg({ orgId })`:
- Validates user has membership for that org
- Sets `activeOrgId` cookie via `cookies()` from `next/headers`
- Returns org details

New tRPC query `organizations.listMyOrgs()`:
- Returns all orgs the user belongs to with role

### UI

Sidebar org switcher dropdown (replaces static org name in sidebar header):
- Shows current org name + logo
- Dropdown lists all orgs with role badges (OWNER, ADMIN, MEMBER)
- "Create New Organization" option at bottom
- Switching calls mutation + `router.refresh()` to reload all data

## Onboarding & Invites

### Create org (`/api/onboarding/create-org`)

- Remove the `if (app_metadata.organizationId) return 400` guard
- Create org + `UserOrganization` membership row (role: OWNER)
- Set `activeOrgId` cookie to the new org
- Write `organizationId` to `app_metadata` for backward compat

### Invite flow (`team.ts`)

- Remove "already belongs to another organization" guard
- `acceptInvite` creates a `UserOrganization` row instead of updating `User.organizationId`
- If user has no active org cookie, set it to the invited org

## What Stays the Same

- All `where: { organizationId: ctx.orgId }` queries — unchanged
- All Inngest cron jobs — iterate by org, not by user
- Portal/pay pages — token-based, no user auth
- Client, Invoice, Payment, Expense models — all scoped by `organizationId` FK
- `getOwnerBcc` — queries `UserOrganization` instead of `User` (minor update)

## Files Affected

### Must change:
- `prisma/schema.prisma` — new model, remove User.organizationId/role
- `src/server/trpc.ts` — read cookie, validate membership
- `src/server/routers/team.ts` — remove single-org guards, use join table
- `src/app/api/onboarding/create-org/route.ts` — allow multiple orgs
- `src/server/services/email-bcc.ts` — query UserOrganization for OWNER
- `src/components/layout/Sidebar.tsx` (or similar) — add org switcher

### Must create:
- `src/server/routers/organizations.ts` — switchOrg, listMyOrgs
- `src/components/layout/OrgSwitcher.tsx` — dropdown component
- `src/app/api/org/switch/route.ts` — cookie-setting endpoint (or handle in tRPC)

### Light touch (role references):
- Any file that reads `User.role` or `User.organizationId` — update to join through UserOrganization
- `src/server/routers/invoices.ts` — `requireRole` reads from ctx.userRole (already set by trpc.ts)
