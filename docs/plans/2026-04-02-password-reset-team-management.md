# Password Reset & Team Management

**Date:** 2026-04-02
**Status:** Approved

## Summary

Add self-service password reset, change password in settings, account profile editing, admin-triggered password resets, and member suspend/reactivate.

## 1. Self-Service Forgot Password

**Pages:**
- `src/app/(auth)/forgot-password/page.tsx` — email input form
- `src/app/(auth)/reset-password/page.tsx` — new password form

**Flow:**
1. "Forgot password?" link on `/sign-in`
2. User enters email → `supabase.auth.resetPasswordForEmail(email, { redirectTo: '/auth/callback?type=recovery' })`
3. Supabase sends reset email
4. User clicks link → `/auth/callback` exchanges token, redirects to `/reset-password`
5. User enters new password → `supabase.auth.updateUser({ password })`
6. Redirect to `/sign-in` with success toast

**Changes:**
- New: `forgot-password/page.tsx`, `reset-password/page.tsx`
- Update: `auth/callback/route.ts` (handle `type=recovery`)
- Update: `sign-in/page.tsx` (add "Forgot password?" link)
- Add `/forgot-password`, `/reset-password` to `PUBLIC_PATHS` in middleware

## 2. Change Password in Settings

**Location:** Existing `/settings/security` page, new card below MFA.

**Component:** `src/components/settings/ChangePasswordForm.tsx`

**Flow:**
1. Enter current password + new password + confirm
2. Verify current via `supabase.auth.signInWithPassword()`
3. Update via `supabase.auth.updateUser({ password })`
4. Toast success, clear form

**Validation:** Min 8 chars, passwords must match.

No tRPC procedure needed — client-side Supabase auth only.

## 3. Account/Profile Page

**Route:** `/settings/account`

**Component:** `src/components/settings/ProfileForm.tsx`

**Features:**
- Edit first name, last name
- Email displayed read-only

**Data flow:**
- Saves to Supabase `user_metadata` via `supabase.auth.updateUser({ data: { firstName, lastName } })`
- Saves to Prisma `User` record via new `team.updateProfile` tRPC mutation (updates `firstName`/`lastName` scoped to `ctx.userId`)

**Navigation:** Add "Account" to settings page grid.

## 4. Admin-Triggered Password Reset

**Location:** Team settings page — action on each member row.

**Flow:**
1. OWNER/ADMIN clicks "Send password reset" on a member
2. Confirmation dialog
3. Calls `team.sendPasswordReset` tRPC mutation
4. Backend: `supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email })` → send via Resend with branded `PasswordResetEmail` template
5. Toast success

**Access:** OWNER/ADMIN only via `requireRole`. Cannot target self.

**New files:**
- `src/emails/PasswordResetEmail.tsx` — React Email template
- Update `src/server/routers/team.ts` — new `sendPasswordReset` procedure
- Update `src/components/team/TeamMemberList.tsx` — new action button

## 5. Suspend/Deactivate Members

**Schema change:** Add `isActive Boolean @default(true)` to `User` model.

**New procedures in `team.ts`:**
- `team.suspend` — sets `isActive = false` (OWNER/ADMIN only, cannot suspend self or OWNER)
- `team.reactivate` — sets `isActive = true` (OWNER/ADMIN only)

**Enforcement:**
- `createTRPCContext` checks `isActive` on the User record; throws FORBIDDEN if false
- Suspended users can still authenticate but all tRPC calls are blocked

**UI:**
- "Suspended" badge on team member rows
- Toggle action: "Suspend" / "Reactivate" with confirmation dialog
- Full-page suspended message for affected users on dashboard access

**Why app-layer?** Simpler than Supabase ban — fully reversible, no session state complexity.
