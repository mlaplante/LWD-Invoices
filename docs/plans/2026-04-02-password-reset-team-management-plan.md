# Password Reset & Team Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add self-service password reset, change password in settings, account profile editing, admin-triggered password resets, and member suspend/reactivate.

**Architecture:** All password flows use Supabase Auth client/admin APIs. Profile editing writes to both Supabase user_metadata and Prisma User record. Suspend uses an `isActive` flag on the User model, enforced in the tRPC context layer.

**Tech Stack:** Supabase Auth, tRPC, Prisma, React Email + Resend, shadcn/ui components

---

### Task 1: Self-Service Forgot Password — Pages & Middleware

**Files:**
- Create: `src/app/(auth)/forgot-password/page.tsx`
- Create: `src/app/(auth)/reset-password/page.tsx`
- Modify: `src/middleware.ts:4-22` (PUBLIC_PATHS array)

**Step 1: Add public paths to middleware**

In `src/middleware.ts`, add `/forgot-password` and `/reset-password` to the `PUBLIC_PATHS` array:

```typescript
const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  // ... rest unchanged
];
```

**Step 2: Create forgot-password page**

Create `src/app/(auth)/forgot-password/page.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const supabaseRef = useRef<SupabaseClient | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <div className="w-full max-w-sm text-center space-y-3">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-muted-foreground text-sm">
            We sent a password reset link to <strong>{email}</strong>.
          </p>
          <Link href="/sign-in" className="text-sm text-primary font-medium hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Remember your password?{" "}
          <Link href="/sign-in" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
```

**Step 3: Create reset-password page**

Create `src/app/(auth)/reset-password/page.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabaseRef = useRef<SupabaseClient | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    const { error } = await getSupabase().auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    toast.success("Password updated successfully");
    router.push("/sign-in");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Set new password</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Enter your new password below.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Updating…" : "Update password"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/sign-in" className="text-primary font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
```

**Step 4: Update auth callback to handle recovery tokens**

In `src/app/auth/callback/route.ts`, add handling for `type=recovery` before the code exchange block. Supabase recovery links use a different flow — they set a session via the URL hash, not via a `code` parameter. The callback should detect `type=recovery` and redirect to `/reset-password`:

After the `redirect` variable (around line 17), add:

```typescript
const type = searchParams.get("type");

if (type === "recovery") {
  // Recovery tokens are exchanged client-side via the URL hash.
  // Just redirect to the reset page — the Supabase client JS will pick up the token.
  return NextResponse.redirect(`${origin}/reset-password`);
}
```

**Step 5: Add "Forgot password?" link to sign-in page**

In `src/app/(auth)/sign-in/page.tsx`, add a link after the password input (around line 163, after the closing `</div>` of the password field):

```tsx
<div className="flex justify-end">
  <Link href="/forgot-password" className="text-xs text-primary hover:underline">
    Forgot password?
  </Link>
</div>
```

**Step 6: Commit**

```bash
git add src/app/\(auth\)/forgot-password/page.tsx src/app/\(auth\)/reset-password/page.tsx src/app/auth/callback/route.ts src/app/\(auth\)/sign-in/page.tsx src/middleware.ts
git commit -m "feat: add self-service forgot password flow"
```

---

### Task 2: Change Password in Settings

**Files:**
- Create: `src/components/settings/ChangePasswordForm.tsx`
- Modify: `src/app/(dashboard)/settings/security/page.tsx`

**Step 1: Create ChangePasswordForm component**

Create `src/components/settings/ChangePasswordForm.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function ChangePasswordForm({ email }: { email: string }) {
  const supabaseRef = useRef<SupabaseClient | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    // Verify current password
    const { error: signInError } = await getSupabase().auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (signInError) {
      setError("Current password is incorrect");
      setLoading(false);
      return;
    }

    // Update password
    const { error: updateError } = await getSupabase().auth.updateUser({
      password: newPassword,
    });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    toast.success("Password updated");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <Button type="submit" disabled={loading}>
        {loading ? "Updating…" : "Change password"}
      </Button>
    </form>
  );
}
```

**Step 2: Add ChangePasswordForm to security settings page**

Replace the contents of `src/app/(dashboard)/settings/security/page.tsx`:

```tsx
import { getUser } from "@/lib/supabase/server";
import { MfaEnrollment } from "@/components/settings/MfaEnrollment";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";

export default async function SecuritySettingsPage() {
  const { data: { user } } = await getUser();
  const email = user?.email ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage two-factor authentication and security settings for your account.
        </p>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Authentication
          </p>
          <p className="text-base font-semibold mt-1">Two-Factor Authentication</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Add an extra layer of security to your account by requiring a code from
            your authenticator app when signing in.
          </p>
        </div>
        <div className="px-6 py-6">
          <MfaEnrollment />
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Password
          </p>
          <p className="text-base font-semibold mt-1">Change Password</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Update the password you use to sign in.
          </p>
        </div>
        <div className="px-6 py-6">
          <ChangePasswordForm email={email} />
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/settings/ChangePasswordForm.tsx src/app/\(dashboard\)/settings/security/page.tsx
git commit -m "feat: add change password form to security settings"
```

---

### Task 3: Account/Profile Page

**Files:**
- Create: `src/components/settings/ProfileForm.tsx`
- Create: `src/app/(dashboard)/settings/account/page.tsx`
- Modify: `src/server/routers/team.ts` (add `updateProfile` procedure)
- Modify: `src/app/(dashboard)/settings/page.tsx` (add Account nav card)

**Step 1: Add `updateProfile` procedure to team router**

In `src/server/routers/team.ts`, add this procedure after the `list` procedure (around line 24):

```typescript
updateProfile: protectedProcedure.input(
  z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().max(100).optional(),
  })
).mutation(async ({ ctx, input }) => {
  return ctx.db.user.updateMany({
    where: { supabaseId: ctx.userId, organizationId: ctx.orgId },
    data: { firstName: input.firstName, lastName: input.lastName ?? null },
  });
}),
```

**Step 2: Create ProfileForm component**

Create `src/components/settings/ProfileForm.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Props = {
  email: string;
  firstName: string;
  lastName: string;
};

export function ProfileForm({ email, firstName: initialFirst, lastName: initialLast }: Props) {
  const supabaseRef = useRef<SupabaseClient | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);
  const [loading, setLoading] = useState(false);

  const updateProfile = trpc.team.updateProfile.useMutation({
    onError: (err) => toast.error(err.message),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    // Update Supabase user_metadata
    await getSupabase().auth.updateUser({
      data: { firstName, lastName },
    });

    // Update Prisma User record
    await updateProfile.mutateAsync({ firstName, lastName });

    toast.success("Profile updated");
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} disabled className="bg-muted/50" />
        <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="first-name">First name</Label>
        <Input
          id="first-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="last-name">Last name</Label>
        <Input
          id="last-name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
```

**Step 3: Create account settings page**

Create `src/app/(dashboard)/settings/account/page.tsx`:

```tsx
import { getUser } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/settings/ProfileForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function AccountSettingsPage() {
  const { data: { user } } = await getUser();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/settings"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight truncate">Account</h1>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Profile
          </p>
          <p className="text-base font-semibold mt-1">Your Profile</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Update your name and profile information.
          </p>
        </div>
        <div className="px-6 py-6">
          <ProfileForm
            email={user?.email ?? ""}
            firstName={(user?.user_metadata?.firstName as string) ?? ""}
            lastName={(user?.user_metadata?.lastName as string) ?? ""}
          />
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Add Account nav card to settings page**

In `src/app/(dashboard)/settings/page.tsx`, add an Account entry at the **beginning** of the `subPages` array (before Security), importing `User` from lucide-react:

Add to imports:
```typescript
import { ..., User } from "lucide-react";
```

Add as first item in `subPages`:
```typescript
{
  href: "/settings/account",
  label: "Account",
  description: "Update your name and profile information.",
  icon: <User className="w-4 h-4" />,
  color: "bg-slate-50 text-slate-600",
},
```

**Step 5: Commit**

```bash
git add src/components/settings/ProfileForm.tsx src/app/\(dashboard\)/settings/account/page.tsx src/server/routers/team.ts src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat: add account profile page with name editing"
```

---

### Task 4: Admin-Triggered Password Reset

**Files:**
- Create: `src/emails/PasswordResetEmail.tsx`
- Modify: `src/server/routers/team.ts` (add `sendPasswordReset` procedure)
- Modify: `src/components/team/TeamMemberList.tsx` (add reset button)

**Step 1: Create PasswordResetEmail template**

Create `src/emails/PasswordResetEmail.tsx` (follow the same structure as `TeamInviteEmail.tsx`):

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
  resetUrl: string;
  orgName: string;
  logoUrl?: string | null;
};

export default function PasswordResetEmail({ resetUrl, orgName, logoUrl }: Props) {
  return (
    <Html>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif", backgroundColor: "#f9fafb", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px" }}>
          <Section style={{ backgroundColor: "#fff", borderRadius: 12, padding: 32, border: "1px solid #e5e7eb" }}>
            {logoUrl && (
              <Img src={logoUrl} alt={orgName} height={40} style={{ marginBottom: 24 }} />
            )}
            <Text style={{ fontSize: 20, fontWeight: 700, color: "#111", marginBottom: 8 }}>
              Reset your password
            </Text>
            <Text style={{ fontSize: 14, color: "#555", lineHeight: "1.6" }}>
              Your administrator at <strong>{orgName}</strong> has requested a password reset for your account.
              Click the button below to set a new password.
            </Text>
            <Button
              href={resetUrl}
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
              Reset Password
            </Button>
            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />
            <Text style={{ fontSize: 12, color: "#999" }}>
              This link expires in 24 hours. If you didn&apos;t expect this email, you can safely ignore it.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

**Step 2: Add `sendPasswordReset` procedure to team router**

In `src/server/routers/team.ts`, add this procedure after `removeMember` (around line 245). Add the import for `PasswordResetEmail` at the top:

```typescript
import PasswordResetEmail from "@/emails/PasswordResetEmail";
```

Procedure:

```typescript
sendPasswordReset: requireRole("OWNER", "ADMIN").input(
  z.object({ userId: z.string() })
).mutation(async ({ ctx, input }) => {
  const targetUser = await ctx.db.user.findFirst({
    where: { id: input.userId, organizationId: ctx.orgId },
  });
  if (!targetUser) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }

  if (targetUser.supabaseId === ctx.userId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Use settings to change your own password" });
  }

  if (!targetUser.supabaseId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "User has no auth account linked" });
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminClient = createAdminClient();

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email: targetUser.email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
    },
  });

  if (linkError || !linkData?.properties?.action_link) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to generate reset link" });
  }

  const org = await ctx.db.organization.findFirst({
    where: { id: ctx.orgId },
    select: { name: true, logoUrl: true },
  });

  const html = await render(
    PasswordResetEmail({
      resetUrl: linkData.properties.action_link,
      orgName: org?.name ?? "your organization",
      logoUrl: org?.logoUrl,
    })
  );

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: targetUser.email,
    subject: `Password reset for ${org?.name ?? "your organization"}`,
    html,
  });

  return { success: true };
}),
```

**Step 3: Add reset password button to TeamMemberList**

In `src/components/team/TeamMemberList.tsx`, add a `sendPasswordReset` mutation alongside the existing mutations (around line 33):

```typescript
const resetPasswordMutation = trpc.team.sendPasswordReset.useMutation({
  onSuccess: () => toast.success("Password reset email sent"),
  onError: (err) => toast.error(err.message),
});
```

Then in the actions `<td>` (around line 82), add a "Reset password" button before the Remove button, inside the `{m.role !== "OWNER" && (` block:

```tsx
<button
  type="button"
  onClick={() => resetPasswordMutation.mutate({ userId: m.id })}
  disabled={resetPasswordMutation.isPending}
  className="text-xs text-primary hover:text-primary/80 transition-colors mr-3"
>
  {resetPasswordMutation.isPending ? "Sending…" : "Reset password"}
</button>
```

**Step 4: Commit**

```bash
git add src/emails/PasswordResetEmail.tsx src/server/routers/team.ts src/components/team/TeamMemberList.tsx
git commit -m "feat: add admin-triggered password reset for team members"
```

---

### Task 5: Suspend/Reactivate Members — Schema & Backend

**Files:**
- Modify: `prisma/schema.prisma` (add `isActive` to User)
- Create: Prisma migration
- Modify: `src/server/trpc.ts` (enforce isActive check)
- Modify: `src/server/routers/team.ts` (add suspend/reactivate procedures, include isActive in list)

**Step 1: Add `isActive` field to User model**

In `prisma/schema.prisma`, add to the `User` model (after `role`):

```prisma
isActive    Boolean  @default(true)
```

**Step 2: Create and run migration**

```bash
npx prisma migrate dev --name add-user-is-active
```

**Step 3: Add isActive check to tRPC context**

In `src/server/trpc.ts`, modify the `protectedProcedure` middleware (around line 38) to check `isActive`. Add a DB lookup after the userId/orgId check:

```typescript
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId || !ctx.orgId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  // Check if user account is suspended
  const user = await ctx.db.user.findFirst({
    where: { supabaseId: ctx.userId, organizationId: ctx.orgId },
    select: { isActive: true },
  });
  if (user && !user.isActive) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been suspended. Contact your administrator." });
  }

  const orgId = ctx.orgId;
  return next({ ctx: { ...ctx, userId: ctx.userId, orgId, userRole: ctx.userRole } });
});
```

**Step 4: Update `team.list` to include `isActive`**

In `src/server/routers/team.ts`, add `isActive: true` to the `select` in the `list` procedure:

```typescript
select: {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  createdAt: true,
},
```

**Step 5: Add `suspend` and `reactivate` procedures**

In `src/server/routers/team.ts`, add after `sendPasswordReset`:

```typescript
suspend: requireRole("OWNER", "ADMIN").input(
  z.object({ userId: z.string() })
).mutation(async ({ ctx, input }) => {
  const targetUser = await ctx.db.user.findFirst({
    where: { id: input.userId, organizationId: ctx.orgId },
  });
  if (!targetUser) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }
  if (targetUser.supabaseId === ctx.userId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot suspend yourself" });
  }
  if (targetUser.role === "OWNER") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot suspend an owner" });
  }
  return ctx.db.user.update({
    where: { id: input.userId },
    data: { isActive: false },
  });
}),

reactivate: requireRole("OWNER", "ADMIN").input(
  z.object({ userId: z.string() })
).mutation(async ({ ctx, input }) => {
  const targetUser = await ctx.db.user.findFirst({
    where: { id: input.userId, organizationId: ctx.orgId },
  });
  if (!targetUser) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }
  return ctx.db.user.update({
    where: { id: input.userId },
    data: { isActive: true },
  });
}),
```

**Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/server/trpc.ts src/server/routers/team.ts
git commit -m "feat: add user suspend/reactivate with isActive enforcement"
```

---

### Task 6: Suspend/Reactivate Members — UI

**Files:**
- Modify: `src/components/team/TeamMemberList.tsx` (add badges, suspend/reactivate buttons)
- Create: `src/app/(dashboard)/suspended/page.tsx` (suspended user landing page)
- Modify: `src/middleware.ts` or `src/app/(dashboard)/layout.tsx` (redirect suspended users)

**Step 1: Update TeamMemberList with suspend/reactivate UI**

In `src/components/team/TeamMemberList.tsx`:

Update the `Member` type to include `isActive`:

```typescript
type Member = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
};
```

Add mutations:

```typescript
const suspendMutation = trpc.team.suspend.useMutation({
  onSuccess: () => {
    toast.success("Member suspended");
    utils.team.list.invalidate();
  },
  onError: (err) => toast.error(err.message),
});

const reactivateMutation = trpc.team.reactivate.useMutation({
  onSuccess: () => {
    toast.success("Member reactivated");
    utils.team.list.invalidate();
  },
  onError: (err) => toast.error(err.message),
});
```

In the Name `<td>`, add a suspended badge after the name display:

```tsx
<td className="px-6 py-3.5 font-medium">
  {m.firstName || m.lastName
    ? `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim()
    : "\u2014"}
  {!m.isActive && (
    <span className="ml-2 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-600">
      Suspended
    </span>
  )}
</td>
```

In the actions `<td>`, add suspend/reactivate buttons (before the Reset password button, inside the non-OWNER block):

```tsx
{m.isActive ? (
  <button
    type="button"
    onClick={() => suspendMutation.mutate({ userId: m.id })}
    className="text-xs text-amber-600 hover:text-amber-700 transition-colors mr-3"
  >
    Suspend
  </button>
) : (
  <button
    type="button"
    onClick={() => reactivateMutation.mutate({ userId: m.id })}
    className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors mr-3"
  >
    Reactivate
  </button>
)}
```

**Step 2: Create suspended user page**

Create `src/app/(dashboard)/suspended/page.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function SuspendedPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center space-y-4 max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
          <span className="text-2xl">🚫</span>
        </div>
        <h1 className="text-2xl font-bold">Account Suspended</h1>
        <p className="text-muted-foreground">
          Your account has been suspended by your organization administrator.
          Please contact them to restore access.
        </p>
        <Button asChild variant="outline">
          <Link href="/sign-in">Sign out</Link>
        </Button>
      </div>
    </div>
  );
}
```

**Step 3: Redirect suspended users in dashboard layout**

The tRPC context already throws FORBIDDEN for suspended users, but we need a graceful redirect for page loads. In `src/app/(dashboard)/layout.tsx`, add a check after the existing `getUser()` calls. Import `db` and `redirect`:

At the top of the file, after existing imports add:

```typescript
import { redirect } from "next/navigation";
import { db } from "@/server/db";
```

Then modify the layout function to be async (if not already) and add the check before the return:

```typescript
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: { user } } = await getUser();
  if (user) {
    const dbUser = await db.user.findFirst({
      where: { supabaseId: user.id },
      select: { isActive: true },
    });
    if (dbUser && !dbUser.isActive) {
      redirect("/suspended");
    }
  }

  return (
    // ... existing JSX unchanged
  );
}
```

Note: The layout already calls `getUser()` in sub-components — the `cache()` wrapper deduplicates this.

Add `/suspended` to the dashboard routes (it doesn't need to be in PUBLIC_PATHS since the user is authenticated).

**Step 4: Commit**

```bash
git add src/components/team/TeamMemberList.tsx src/app/\(dashboard\)/suspended/page.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "feat: add suspend/reactivate UI and suspended user page"
```

---

### Task 7: Final Verification

**Step 1: Run type check**

```bash
npx tsc --noEmit
```

Verify no new errors (pre-existing test file errors are fine).

**Step 2: Run build**

```bash
npm run build
```

Verify the build succeeds on Netlify (no prerender errors — all new pages are dynamic due to auth).

**Step 3: Manual smoke test checklist**

- [ ] `/sign-in` shows "Forgot password?" link
- [ ] `/forgot-password` sends reset email
- [ ] Reset email link lands on `/reset-password` and allows setting new password
- [ ] `/settings/security` shows change password form
- [ ] Change password works (verifies current, sets new)
- [ ] `/settings/account` shows profile form with name fields
- [ ] Profile save updates both Supabase and DB
- [ ] `/settings` grid shows Account card
- [ ] Team list shows "Reset password" button on non-OWNER members
- [ ] Admin password reset sends branded email
- [ ] Team list shows "Suspend" button on non-OWNER members
- [ ] Suspending a member shows "Suspended" badge and "Reactivate" button
- [ ] Suspended users see the `/suspended` page on dashboard access
- [ ] Suspended users get FORBIDDEN on tRPC calls
- [ ] Reactivating a member restores their access

**Step 4: Final commit**

```bash
git push
```
