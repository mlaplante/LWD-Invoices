# Team Invitations & Role-Based Access Control — Design Document

**Date**: 2026-03-31
**Status**: Approved

## Purpose

Add the ability to invite team members to an organization with role-based access control (Owner, Admin, Accountant, Viewer). Invitations are sent via email (Resend) with a shareable link fallback.

## Schema Changes

### Updated `UserRole` Enum

```
OWNER      — full access, can delete org, transfer ownership
ADMIN      — full access except org deletion/transfer
ACCOUNTANT — payments, expenses, reports only
VIEWER     — read-only access to reports
```

Existing `STAFF` role is removed. Existing users with `ADMIN` keep their role. The org creator gets `OWNER`.

### New `Invitation` Model

```prisma
model Invitation {
  id        String           @id @default(cuid())
  email     String
  role      UserRole         @default(VIEWER)
  token     String           @unique @default(cuid())
  expiresAt DateTime         // 7 days from creation
  status    InvitationStatus @default(PENDING)

  invitedById    String
  invitedBy      User         @relation("InvitedBy", fields: [invitedById], references: [id])
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@unique([email, organizationId])
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  EXPIRED
  REVOKED
}
```

No membership table needed — existing `User.organizationId` + `User.role` is sufficient (single-org-per-user).

## Invitation Flow

### Sending an Invite (Owner/Admin)

1. Owner/Admin enters email + selects role on Team Settings page
2. tRPC `team.invite` creates `Invitation` record with random token, 7-day expiry
3. Sends branded `TeamInviteEmail` via Resend with link: `{APP_URL}/invite/{token}`
4. Returns the link so inviter can copy/share manually

### Accepting an Invite

1. Recipient clicks link -> `/invite/[token]` page
2. Page validates token (not expired, not revoked, still PENDING)
3. **If logged in:** Join org immediately — update `organizationId` and `role`, mark invitation `ACCEPTED`
4. **If not logged in but has account:** Redirect to sign-in with `?redirect=/invite/{token}`
5. **If new user:** Redirect to sign-up with `?redirect=/invite/{token}` — after account creation, redirect consumes token (skips normal onboarding)

### Edge Cases

- Inviting someone already in the org -> error "already a member"
- Inviting someone in another org -> they must leave their current org first (blocked)
- Expired/revoked tokens -> friendly error page
- Resending invite -> revokes old token, creates new one

## Role-Based Access Control

### Enforcement

A `requireRole()` tRPC middleware helper:

```typescript
const requireRole = (...allowed: UserRole[]) =>
  protectedProcedure.use(({ ctx, next }) => {
    if (!allowed.includes(ctx.userRole)) throw new TRPCError({ code: "FORBIDDEN" });
    return next({ ctx });
  });
```

### Permissions Matrix

| Router | Owner | Admin | Accountant | Viewer |
|--------|-------|-------|------------|--------|
| invoices (CRUD, send) | full | full | read | read |
| clients (CRUD) | full | full | read | read |
| projects (CRUD) | full | full | read | read |
| payments (record) | full | full | full | read |
| expenses (CRUD) | full | full | full | read |
| reports (view, export) | full | full | full | full |
| taxes/settings | full | full | read | read |
| team (invite, remove, roles) | full | full | no | no |
| organization (delete, transfer) | full | no | no | no |

UI conditionally renders nav items and action buttons based on `userRole`, but tRPC guards are the security boundary.

## UI Components

### New Pages

- `/settings/team` — Team management: member list, invite form, pending invitations
- `/invite/[token]` — Public invite acceptance page

### New Components

- `InviteTeamMemberForm` — Email input + role select + send button
- `TeamMemberList` — Table of members with role change dropdown and remove button
- `PendingInvitationList` — Pending invites with resend/revoke actions

### New Email Template

- `TeamInviteEmail.tsx` — "{inviter} invited you to join {orgName} on Pancake" with accept button

## tRPC Router: `team.ts`

- `team.list` — list org members
- `team.invite` — create invitation + send email (Owner/Admin)
- `team.resendInvite` — revoke old, create new, resend email (Owner/Admin)
- `team.revokeInvite` — mark invitation REVOKED (Owner/Admin)
- `team.pendingInvites` — list pending invitations (Owner/Admin)
- `team.changeRole` — update member role (can't change own, can't demote last Owner) (Owner/Admin)
- `team.removeMember` — remove member from org (can't remove self if Owner) (Owner/Admin)
- `team.acceptInvite` — consume token, join org (public/authenticated)

## Modified Files

- `prisma/schema.prisma` — new enum values, Invitation model, relations
- `src/server/trpc.ts` — add `userRole` to context
- All existing routers — add `requireRole()` guards per permissions matrix
- Sidebar nav — add "Team" link, conditionally hide items by role
- Onboarding flow — skip if arriving via invite token
- Auth callback — check for pending invite redirect
