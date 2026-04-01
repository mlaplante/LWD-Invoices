# Group D: Portal & Branding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add white-label portal branding and customizable invoice PDF templates.

**Architecture:** Organization model gains branding/template fields (D1: portalTagline, portalFooterText, brandFont, hidePoweredBy; D2: invoiceTemplate, invoiceFontFamily, invoiceAccentColor, invoiceShowLogo, invoiceFooterText). Portal layouts read org branding and inject CSS custom properties + font classes. PDF generation dispatches to one of four React PDF template components based on `invoiceTemplate`, all sharing the existing `FullInvoice` type from `src/server/services/invoice-pdf.tsx`.

**Tech Stack:** Prisma 7 (schema + migration), tRPC v11 (org router), React PDF (`@react-pdf/renderer`), Next.js 16 App Router (portal pages, settings pages), Tailwind v4 (portal styling), `@react-email/components` (email templates), shadcn/ui (settings forms).

---

## D1: White-Label Portal Branding

### Task D1.1 — Prisma Schema: Add Portal Branding Fields

**Files:** `prisma/schema.prisma`

Add these fields to the `Organization` model, after the existing `lateFeeIntervalDays` field and before `createdAt`:

```prisma
// ─── Portal Branding ────────────────────────────────────────────────────────
portalTagline       String?
portalFooterText    String?
brandFont           String?  // "inter" | "georgia" | "system"
hidePoweredBy       Boolean  @default(false)
```

**Run:**
```bash
npx prisma migrate dev --name add-portal-branding-fields
npx prisma generate
```

**Commit:**
```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(D1.1): add portal branding fields to Organization schema"
```

---

### Task D1.2 — tRPC: Expose Portal Branding in Org Router

**File:** `src/server/routers/organization.ts`

**Changes:**

1. Add the new fields to the `get` procedure's `select`:

```typescript
// Inside organization.get select object, after emailBccOwner:
portalTagline: true,
portalFooterText: true,
brandFont: true,
hidePoweredBy: true,
```

2. Add the new fields to the `update` procedure's input schema:

```typescript
// Inside the z.object() for update input, after lateFeeIntervalDays:
portalTagline: z.string().max(200).nullable().optional(),
portalFooterText: z.string().max(500).nullable().optional(),
brandFont: z.enum(["inter", "georgia", "system"]).nullable().optional(),
hidePoweredBy: z.boolean().optional(),
```

**Test:**
```bash
npx vitest run src/__tests__/routers-organization.test.ts
```

**Commit:**
```bash
git add src/server/routers/organization.ts
git commit -m "feat(D1.2): expose portal branding fields in org tRPC router"
```

---

### Task D1.3 — Portal Branding Helper: `getPortalBranding`

**New File:** `src/lib/portal-branding.ts`

This pure helper extracts branding config from an organization record into a flat object used by portal layouts.

```typescript
export type PortalBranding = {
  brandColor: string;
  logoUrl: string | null;
  orgName: string;
  tagline: string | null;
  footerText: string | null;
  fontClass: string;
  fontFamily: string;
  hidePoweredBy: boolean;
};

const FONT_MAP: Record<string, { className: string; family: string }> = {
  inter: {
    className: "font-sans",
    family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
  georgia: {
    className: "font-serif",
    family: "Georgia, 'Times New Roman', Times, serif",
  },
  system: {
    className: "font-sans",
    family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
};

export function getPortalBranding(org: {
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  portalTagline?: string | null;
  portalFooterText?: string | null;
  brandFont?: string | null;
  hidePoweredBy?: boolean;
}): PortalBranding {
  const font = FONT_MAP[org.brandFont ?? "inter"] ?? FONT_MAP.inter;
  return {
    brandColor: org.brandColor ?? "#2563eb",
    logoUrl: org.logoUrl,
    orgName: org.name,
    tagline: org.portalTagline ?? null,
    footerText: org.portalFooterText ?? null,
    fontClass: font.className,
    fontFamily: font.family,
    hidePoweredBy: org.hidePoweredBy ?? false,
  };
}
```

**Test File:** `src/__tests__/portal-branding.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { getPortalBranding } from "@/lib/portal-branding";

describe("getPortalBranding", () => {
  const baseOrg = {
    name: "Acme Corp",
    logoUrl: "https://example.com/logo.png",
    brandColor: "#ff0000",
  };

  it("returns defaults when optional fields are missing", () => {
    const result = getPortalBranding(baseOrg);
    expect(result.brandColor).toBe("#ff0000");
    expect(result.tagline).toBeNull();
    expect(result.footerText).toBeNull();
    expect(result.fontClass).toBe("font-sans");
    expect(result.hidePoweredBy).toBe(false);
  });

  it("uses default brand color when null", () => {
    const result = getPortalBranding({ ...baseOrg, brandColor: null });
    expect(result.brandColor).toBe("#2563eb");
  });

  it("maps georgia font correctly", () => {
    const result = getPortalBranding({ ...baseOrg, brandFont: "georgia" });
    expect(result.fontClass).toBe("font-serif");
    expect(result.fontFamily).toContain("Georgia");
  });

  it("maps system font correctly", () => {
    const result = getPortalBranding({ ...baseOrg, brandFont: "system" });
    expect(result.fontClass).toBe("font-sans");
    expect(result.fontFamily).toContain("BlinkMacSystemFont");
  });

  it("passes through tagline and footer text", () => {
    const result = getPortalBranding({
      ...baseOrg,
      portalTagline: "We build things",
      portalFooterText: "Thanks for your business",
    });
    expect(result.tagline).toBe("We build things");
    expect(result.footerText).toBe("Thanks for your business");
  });

  it("respects hidePoweredBy", () => {
    const result = getPortalBranding({ ...baseOrg, hidePoweredBy: true });
    expect(result.hidePoweredBy).toBe(true);
  });
});
```

**Run:**
```bash
npx vitest run src/__tests__/portal-branding.test.ts
```

**Commit:**
```bash
git add src/lib/portal-branding.ts src/__tests__/portal-branding.test.ts
git commit -m "feat(D1.3): add getPortalBranding helper with tests"
```

---

### Task D1.4 — Portal Shell Component: `PortalShell`

**New File:** `src/components/portal/PortalShell.tsx`

A server component wrapper that applies branding to all portal pages. Renders the header (logo, org name, tagline), wraps children, and renders the footer (footerText, powered-by).

```tsx
import type { PortalBranding } from "@/lib/portal-branding";

type Props = {
  branding: PortalBranding;
  children: React.ReactNode;
};

export function PortalShell({ branding, children }: Props) {
  return (
    <div
      className={`min-h-screen bg-background ${branding.fontClass}`}
      style={
        {
          "--portal-brand": branding.brandColor,
          fontFamily: branding.fontFamily,
        } as React.CSSProperties
      }
    >
      {/* Header */}
      <header
        className="border-b"
        style={{ borderColor: `${branding.brandColor}20` }}
      >
        <div className="mx-auto max-w-3xl px-4 py-6 text-center">
          {branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={branding.orgName}
              className="mx-auto mb-3 h-12 w-auto max-w-[160px] object-contain"
            />
          )}
          <h1 className="text-2xl font-bold text-foreground">
            {branding.orgName}
          </h1>
          {branding.tagline && (
            <p className="text-sm text-muted-foreground mt-1">
              {branding.tagline}
            </p>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6 text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-3xl px-4 space-y-1">
          {branding.footerText && <p>{branding.footerText}</p>}
          {!branding.hidePoweredBy && (
            <p className="opacity-60">Powered by LWD Invoices</p>
          )}
        </div>
      </footer>
    </div>
  );
}
```

**Commit:**
```bash
git add src/components/portal/PortalShell.tsx
git commit -m "feat(D1.4): add PortalShell component with branding support"
```

---

### Task D1.5 — Update Portal Invoice Page to Use Branding

**File:** `src/app/portal/[token]/page.tsx`

**Changes:**

1. Import the helper and shell:

```typescript
import { getPortalBranding } from "@/lib/portal-branding";
import { PortalShell } from "@/components/portal/PortalShell";
```

2. Update the `organization` select in the `db.invoice.findUnique` call to include the new fields:

```typescript
organization: {
  select: {
    name: true,
    logoUrl: true,
    brandColor: true,
    portalTagline: true,
    portalFooterText: true,
    brandFont: true,
    hidePoweredBy: true,
  },
},
```

3. After the existing `const brandColor = invoice.organization.brandColor ?? "#2563eb";` line, add:

```typescript
const branding = getPortalBranding(invoice.organization);
```

4. Replace the outer wrapper. The current structure is:

```tsx
<div className="min-h-screen bg-background">
  <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
    {/* Org header */}
    <div className="text-center">
      {invoice.organization.logoUrl && (
        <img ... />
      )}
      <h1 ...>{invoice.organization.name}</h1>
    </div>
    {/* ... rest of content ... */}
  </div>
</div>
```

Replace with:

```tsx
<PortalShell branding={branding}>
  <div className="space-y-6">
    {/* Invoice card — remove the org header div entirely, PortalShell handles it */}
    {/* ... rest of content starting from the invoice card ... */}
  </div>
</PortalShell>
```

Remove the `{/* Org header */}` block entirely since `PortalShell` now renders it.

**Commit:**
```bash
git add src/app/portal/[token]/page.tsx
git commit -m "feat(D1.5): portal invoice page uses PortalShell for branding"
```

---

### Task D1.6 — Update Portal Invoice Layout to Include Branding Fields

**File:** `src/app/portal/[token]/layout.tsx`

Update the `organization` select to include branding fields so they are available for any child pages:

```typescript
organization: {
  select: {
    name: true,
    logoUrl: true,
    portalTagline: true,
    portalFooterText: true,
    brandFont: true,
    hidePoweredBy: true,
    users: {
      where: { role: "ADMIN" },
      select: { email: true },
    },
  },
},
```

No structural changes needed to the layout itself since it renders `{children}` — the branding is applied in the page.

**Commit:**
```bash
git add src/app/portal/[token]/layout.tsx
git commit -m "feat(D1.6): include branding fields in portal invoice layout query"
```

---

### Task D1.7 — Update Portal Dashboard Layout to Use Branding

**File:** `src/app/portal/dashboard/[clientToken]/layout.tsx`

**Changes:**

1. Import helpers:

```typescript
import { getPortalBranding } from "@/lib/portal-branding";
import { PortalShell } from "@/components/portal/PortalShell";
```

2. Update the `organization` select to include all branding fields:

```typescript
organization: {
  select: {
    name: true,
    logoUrl: true,
    brandColor: true,
    portalTagline: true,
    portalFooterText: true,
    brandFont: true,
    hidePoweredBy: true,
  },
},
```

3. Replace the current return block. The current structure is:

```tsx
const brandColor = client.organization.brandColor ?? "#2563eb";

return (
  <div className="min-h-screen bg-background">
    <header style={{ borderColor: `${brandColor}20` }}>
      <div className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-3">
        {/* logo */}
        <div className="flex-1">
          <h1>{client.organization.name}</h1>
          <p>Client Portal</p>
        </div>
      </div>
    </header>
    <main>{children}</main>
  </div>
);
```

Replace with:

```tsx
const branding = getPortalBranding(client.organization);

return (
  <PortalShell branding={branding}>
    {children}
  </PortalShell>
);
```

Note: the `PortalShell` uses `max-w-3xl` by default. Since the dashboard uses `max-w-5xl`, either:
- Add a `maxWidth` prop to `PortalShell` (preferred), or
- Override with a wrapping div.

**Preferred approach — update `PortalShell`:** Add optional `maxWidth` prop defaulting to `"max-w-3xl"`. Update the header, main, and footer divs to use it:

```tsx
type Props = {
  branding: PortalBranding;
  children: React.ReactNode;
  maxWidth?: string; // Tailwind max-w class, default "max-w-3xl"
};

export function PortalShell({ branding, children, maxWidth = "max-w-3xl" }: Props) {
  // Use `mx-auto ${maxWidth} px-4` everywhere that currently has "mx-auto max-w-3xl px-4"
```

Then in the dashboard layout:

```tsx
<PortalShell branding={branding} maxWidth="max-w-5xl">
  {children}
</PortalShell>
```

**Commit:**
```bash
git add src/app/portal/dashboard/[clientToken]/layout.tsx src/components/portal/PortalShell.tsx
git commit -m "feat(D1.7): portal dashboard layout uses PortalShell with branding"
```

---

### Task D1.8 — Update Portal Login Page to Use Branding

**File:** `src/app/portal/[token]/login/page.tsx`

Currently this is a client component with no branding. Convert the branding portion to a server wrapper or pass branding data.

**Approach:** Create a server layout for the login route that fetches org branding and passes it via the page structure.

**New File:** `src/app/portal/[token]/login/layout.tsx`

```tsx
import { db } from "@/server/db";
import { redirect } from "next/navigation";
import { getPortalBranding } from "@/lib/portal-branding";
import { PortalShell } from "@/components/portal/PortalShell";

export default async function PortalLoginLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    select: {
      organization: {
        select: {
          name: true,
          logoUrl: true,
          brandColor: true,
          portalTagline: true,
          portalFooterText: true,
          brandFont: true,
          hidePoweredBy: true,
        },
      },
    },
  });

  if (!invoice) redirect("/");

  const branding = getPortalBranding(invoice.organization);

  return <PortalShell branding={branding}>{children}</PortalShell>;
}
```

**Update File:** `src/app/portal/[token]/login/page.tsx`

Remove the outer wrapping `<div className="min-h-screen bg-background flex items-center justify-center p-4">` since `PortalShell` handles the page chrome. Replace with:

```tsx
<div className="flex items-center justify-center py-12">
  <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-card p-8">
    {/* ... form content unchanged ... */}
  </div>
</div>
```

**Commit:**
```bash
git add src/app/portal/[token]/login/layout.tsx src/app/portal/[token]/login/page.tsx
git commit -m "feat(D1.8): portal login page uses branded PortalShell layout"
```

---

### Task D1.9 — Email Templates: Use Dynamic Brand Color

**Files:** All email templates in `src/emails/`

Currently, email templates use a hardcoded `const ACCENT = "#2563eb"`. Update them to accept a `brandColor` prop and fall back to the default.

**Pattern for each email template:**

1. Add `brandColor?: string` to the Props type
2. Replace `const ACCENT = "#2563eb"` with `const ACCENT = brandColor ?? "#2563eb"`
3. Update the footer to conditionally show "Powered by LWD Invoices" based on a new `hidePoweredBy?: boolean` prop

**Files to update:**
- `src/emails/InvoiceSentEmail.tsx`
- `src/emails/PaymentReminderEmail.tsx`
- `src/emails/PaymentReceiptEmail.tsx`
- `src/emails/OverdueEmail.tsx`
- `src/emails/InvoiceViewedEmail.tsx`
- `src/emails/InvoiceCommentEmail.tsx`
- `src/emails/ProposalSignedEmail.tsx`

**Example change for `InvoiceSentEmail.tsx`:**

Add to Props:
```typescript
type Props = {
  // ... existing props ...
  brandColor?: string;
  hidePoweredBy?: boolean;
};
```

In function body:
```typescript
const ACCENT = brandColor ?? "#2563eb";
```

In footer:
```tsx
<Text style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
  Sent by {orgName}{!hidePoweredBy ? " · Powered by LWD Invoices" : ""}
</Text>
```

Apply the same pattern to all 7 email templates.

**Note:** `TeamInviteEmail.tsx` is internal (sent to team members, not clients) so it does not need branding.

**Then update callers** to pass `brandColor` and `hidePoweredBy` when rendering email templates. The callers include:
- `src/app/portal/[token]/layout.tsx` (InvoiceViewedEmail)
- Any files in `src/server/` or `src/inngest/` that render and send these emails (search for `import.*Email.*from.*@/emails/`)

For each caller, ensure the organization's `brandColor` and `hidePoweredBy` are fetched and passed to the email component.

**Commit:**
```bash
git add src/emails/ src/app/portal/[token]/layout.tsx
git commit -m "feat(D1.9): email templates use dynamic brandColor and hidePoweredBy"
```

---

### Task D1.10 — Settings Page: Portal Branding Form

**New File:** `src/components/settings/PortalBrandingForm.tsx`

A client component for the settings page that lets the org owner configure portal branding fields with a live preview.

```tsx
"use client";

import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type Props = {
  org: {
    name: string;
    logoUrl: string | null;
    brandColor: string | null;
    portalTagline: string | null;
    portalFooterText: string | null;
    brandFont: string | null;
    hidePoweredBy: boolean;
  };
};

const FONT_OPTIONS = [
  { value: "inter", label: "Inter (Sans-serif)" },
  { value: "georgia", label: "Georgia (Serif)" },
  { value: "system", label: "System Default" },
] as const;

const FONT_FAMILIES: Record<string, string> = {
  inter: "'Inter', sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

export function PortalBrandingForm({ org }: Props) {
  const utils = trpc.useUtils();
  const updateMutation = trpc.organization.update.useMutation({
    onSuccess: () => {
      void utils.organization.get.invalidate();
      toast.success("Portal branding saved");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const [tagline, setTagline] = useState(org.portalTagline ?? "");
  const [footerText, setFooterText] = useState(org.portalFooterText ?? "");
  const [font, setFont] = useState(org.brandFont ?? "inter");
  const [hidePowered, setHidePowered] = useState(org.hidePoweredBy);

  function handleSave() {
    updateMutation.mutate({
      portalTagline: tagline || null,
      portalFooterText: footerText || null,
      brandFont: font as "inter" | "georgia" | "system",
      hidePoweredBy: hidePowered,
    });
  }

  const brandColor = org.brandColor ?? "#2563eb";
  const previewFont = FONT_FAMILIES[font] ?? FONT_FAMILIES.inter;

  return (
    <div className="space-y-6">
      {/* Form fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="portalTagline">Portal Tagline</Label>
          <Input
            id="portalTagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="e.g. Professional invoicing made simple"
            maxLength={200}
          />
          <p className="text-xs text-muted-foreground">
            Shown below your organization name in the portal header.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="brandFont">Portal Font</Label>
          <Select value={font} onValueChange={setFont}>
            <SelectTrigger id="brandFont">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="portalFooterText">Footer Text</Label>
        <Textarea
          id="portalFooterText"
          value={footerText}
          onChange={(e) => setFooterText(e.target.value)}
          placeholder="e.g. Thank you for your business!"
          rows={2}
          maxLength={500}
        />
        <p className="text-xs text-muted-foreground">
          Custom text displayed in the portal footer.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="hidePoweredBy"
          checked={hidePowered}
          onCheckedChange={setHidePowered}
        />
        <Label htmlFor="hidePoweredBy" className="cursor-pointer">
          Hide &quot;Powered by LWD Invoices&quot; badge
        </Label>
      </div>

      {/* Live Preview */}
      <div className="space-y-1.5">
        <Label>Preview</Label>
        <div
          className="rounded-xl border border-border/50 overflow-hidden text-sm"
          style={{ fontFamily: previewFont }}
        >
          {/* Preview header */}
          <div
            className="px-4 py-3 text-center border-b"
            style={{ borderColor: `${brandColor}20` }}
          >
            {org.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={org.logoUrl}
                alt={org.name}
                className="mx-auto mb-2 h-8 w-auto max-w-[120px] object-contain"
              />
            )}
            <p className="font-bold text-foreground">{org.name}</p>
            {tagline && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {tagline}
              </p>
            )}
          </div>

          {/* Preview body */}
          <div className="px-4 py-6 bg-muted/30 text-center text-muted-foreground text-xs">
            Invoice content preview area
          </div>

          {/* Preview footer */}
          <div className="px-4 py-2.5 text-center text-xs text-muted-foreground border-t border-border/50">
            {footerText && <p>{footerText}</p>}
            {!hidePowered && (
              <p className="opacity-60">Powered by LWD Invoices</p>
            )}
          </div>
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={updateMutation.isPending}
      >
        {updateMutation.isPending ? "Saving..." : "Save Portal Branding"}
      </Button>
    </div>
  );
}
```

**Commit:**
```bash
git add src/components/settings/PortalBrandingForm.tsx
git commit -m "feat(D1.10): add PortalBrandingForm settings component with live preview"
```

---

### Task D1.11 — Settings Page: Add Portal Branding Section

**File:** `src/app/(dashboard)/settings/page.tsx`

**Changes:**

1. Import the new component:

```typescript
import { PortalBrandingForm } from "@/components/settings/PortalBrandingForm";
```

2. Add a new settings card after the existing "Branding" section (before "Currencies"). Insert this JSX block:

```tsx
{/* Portal Branding */}
<div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
  <div className="px-6 py-5 border-b border-border/50">
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
      Portal
    </p>
    <p className="text-base font-semibold mt-1">Portal Branding</p>
    <p className="text-sm text-muted-foreground mt-0.5">
      Customize how your client portal looks — tagline, fonts, footer, and powered-by badge.
    </p>
  </div>
  <div className="px-6 py-6">
    <PortalBrandingForm org={org} />
  </div>
</div>
```

**Note:** The `org` object from `api.organization.get()` already includes the new fields after D1.2.

**Commit:**
```bash
git add src/app/(dashboard)/settings/page.tsx
git commit -m "feat(D1.11): add Portal Branding section to settings page"
```

---

## D2: Invoice Templates / Themes

### Task D2.1 — Prisma Schema: Add Invoice Template Fields

**File:** `prisma/schema.prisma`

Add these fields to the `Organization` model, after the portal branding fields:

```prisma
// ─── Invoice Templates ──────────────────────────────────────────────────────
invoiceTemplate      String   @default("modern")  // "modern" | "classic" | "minimal" | "compact"
invoiceFontFamily    String?  // "helvetica" | "georgia" | "courier"
invoiceAccentColor   String?  // hex color, falls back to brandColor
invoiceShowLogo      Boolean  @default(true)
invoiceFooterText    String?
```

**Run:**
```bash
npx prisma migrate dev --name add-invoice-template-fields
npx prisma generate
```

**Commit:**
```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(D2.1): add invoice template fields to Organization schema"
```

---

### Task D2.2 — tRPC: Expose Invoice Template Fields

**File:** `src/server/routers/organization.ts`

1. Add to `get` select:

```typescript
invoiceTemplate: true,
invoiceFontFamily: true,
invoiceAccentColor: true,
invoiceShowLogo: true,
invoiceFooterText: true,
```

2. Add to `update` input:

```typescript
invoiceTemplate: z.enum(["modern", "classic", "minimal", "compact"]).optional(),
invoiceFontFamily: z.enum(["helvetica", "georgia", "courier"]).nullable().optional(),
invoiceAccentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
invoiceShowLogo: z.boolean().optional(),
invoiceFooterText: z.string().max(500).nullable().optional(),
```

**Commit:**
```bash
git add src/server/routers/organization.ts
git commit -m "feat(D2.2): expose invoice template fields in org tRPC router"
```

---

### Task D2.3 — Template Config Helper: `getInvoiceTemplateConfig`

**New File:** `src/server/services/invoice-template-config.ts`

Pure helper that extracts template rendering config from an organization.

```typescript
export type InvoiceTemplateConfig = {
  template: "modern" | "classic" | "minimal" | "compact";
  fontFamily: string;       // React PDF font family name
  accentColor: string;      // hex
  showLogo: boolean;
  footerText: string | null;
};

const FONT_MAP: Record<string, string> = {
  helvetica: "Helvetica",
  georgia: "Times-Roman",      // React PDF built-in serif
  courier: "Courier",
};

export function getInvoiceTemplateConfig(org: {
  brandColor: string | null;
  invoiceTemplate?: string | null;
  invoiceFontFamily?: string | null;
  invoiceAccentColor?: string | null;
  invoiceShowLogo?: boolean;
  invoiceFooterText?: string | null;
}): InvoiceTemplateConfig {
  const validTemplates = ["modern", "classic", "minimal", "compact"] as const;
  const rawTemplate = org.invoiceTemplate ?? "modern";
  const template = validTemplates.includes(rawTemplate as typeof validTemplates[number])
    ? (rawTemplate as InvoiceTemplateConfig["template"])
    : "modern";

  return {
    template,
    fontFamily: FONT_MAP[org.invoiceFontFamily ?? "helvetica"] ?? "Helvetica",
    accentColor: org.invoiceAccentColor ?? org.brandColor ?? "#2563eb",
    showLogo: org.invoiceShowLogo ?? true,
    footerText: org.invoiceFooterText ?? null,
  };
}
```

**Test File:** `src/__tests__/invoice-template-config.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { getInvoiceTemplateConfig } from "@/server/services/invoice-template-config";

describe("getInvoiceTemplateConfig", () => {
  const baseOrg = { brandColor: "#ff0000" };

  it("returns modern template by default", () => {
    const config = getInvoiceTemplateConfig(baseOrg);
    expect(config.template).toBe("modern");
    expect(config.fontFamily).toBe("Helvetica");
    expect(config.accentColor).toBe("#ff0000");
    expect(config.showLogo).toBe(true);
    expect(config.footerText).toBeNull();
  });

  it("falls back to brandColor when invoiceAccentColor is null", () => {
    const config = getInvoiceTemplateConfig({
      ...baseOrg,
      invoiceAccentColor: null,
    });
    expect(config.accentColor).toBe("#ff0000");
  });

  it("uses invoiceAccentColor when set", () => {
    const config = getInvoiceTemplateConfig({
      ...baseOrg,
      invoiceAccentColor: "#00ff00",
    });
    expect(config.accentColor).toBe("#00ff00");
  });

  it("falls back to default when both colors are null", () => {
    const config = getInvoiceTemplateConfig({ brandColor: null });
    expect(config.accentColor).toBe("#2563eb");
  });

  it("maps georgia to Times-Roman for React PDF", () => {
    const config = getInvoiceTemplateConfig({
      ...baseOrg,
      invoiceFontFamily: "georgia",
    });
    expect(config.fontFamily).toBe("Times-Roman");
  });

  it("maps courier correctly", () => {
    const config = getInvoiceTemplateConfig({
      ...baseOrg,
      invoiceFontFamily: "courier",
    });
    expect(config.fontFamily).toBe("Courier");
  });

  it("handles invalid template gracefully", () => {
    const config = getInvoiceTemplateConfig({
      ...baseOrg,
      invoiceTemplate: "nonexistent",
    });
    expect(config.template).toBe("modern");
  });

  it("passes through footer text", () => {
    const config = getInvoiceTemplateConfig({
      ...baseOrg,
      invoiceFooterText: "Thank you!",
    });
    expect(config.footerText).toBe("Thank you!");
  });

  it("respects showLogo false", () => {
    const config = getInvoiceTemplateConfig({
      ...baseOrg,
      invoiceShowLogo: false,
    });
    expect(config.showLogo).toBe(false);
  });
});
```

**Run:**
```bash
npx vitest run src/__tests__/invoice-template-config.test.ts
```

**Commit:**
```bash
git add src/server/services/invoice-template-config.ts src/__tests__/invoice-template-config.test.ts
git commit -m "feat(D2.3): add getInvoiceTemplateConfig helper with tests"
```

---

### Task D2.4 — Shared PDF Types and Utilities

**New File:** `src/server/services/pdf-templates/types.ts`

Shared types for all PDF template components.

```typescript
import type { FullInvoice } from "../invoice-pdf";
import type { InvoiceTemplateConfig } from "../invoice-template-config";

export type TemplateProps = {
  invoice: FullInvoice;
  config: InvoiceTemplateConfig;
};
```

**Commit:**
```bash
git add src/server/services/pdf-templates/types.ts
git commit -m "feat(D2.4): add shared PDF template types"
```

---

### Task D2.5 — Modern Template (Refactor Current PDF)

**New File:** `src/server/services/pdf-templates/modern.tsx`

Extract the current `InvoiceDocument` from `invoice-pdf.tsx` into a standalone template component. This is the existing layout refactored to accept `TemplateProps`.

```tsx
import {
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import React from "react";
import type { TemplateProps } from "./types";
import { formatAmount, formatDate } from "../pdf-shared";

export function ModernTemplate({ invoice, config }: TemplateProps) {
  const sym = invoice.currency.symbol;
  const symPos = invoice.currency.symbolPosition;
  const fmt = (n: number | string | { toNumber(): number }) =>
    formatAmount(n, sym, symPos);

  const typeLabel: Record<string, string> = {
    SIMPLE: "INVOICE",
    DETAILED: "INVOICE",
    ESTIMATE: "ESTIMATE",
    CREDIT_NOTE: "CREDIT NOTE",
  };

  const fontFamily = config.fontFamily;
  const boldFamily = `${fontFamily}-Bold`;
  const accentColor = config.accentColor;

  const styles = StyleSheet.create({
    page: {
      fontFamily,
      fontSize: 10,
      padding: 48,
      color: "#1a1a1a",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 32,
    },
    orgName: {
      fontSize: 18,
      fontFamily: boldFamily,
      marginBottom: 4,
    },
    invoiceMeta: {
      alignItems: "flex-end",
    },
    invoiceTitle: {
      fontSize: 22,
      fontFamily: boldFamily,
      marginBottom: 4,
    },
    invoiceNumber: {
      fontSize: 11,
      color: "#555",
    },
    divider: {
      borderBottom: "1 solid #e5e7eb",
      marginVertical: 16,
    },
    twoCol: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 24,
    },
    label: {
      fontSize: 8,
      color: "#6b7280",
      textTransform: "uppercase",
      marginBottom: 3,
    },
    value: {
      fontSize: 10,
    },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: "#f3f4f6",
      padding: "6 8",
      borderRadius: 3,
      marginBottom: 2,
    },
    tableRow: {
      flexDirection: "row",
      padding: "5 8",
      borderBottom: "1 solid #f3f4f6",
    },
    colName: { flex: 3 },
    colQty: { flex: 1, textAlign: "right" },
    colRate: { flex: 1.5, textAlign: "right" },
    colAmount: { flex: 1.5, textAlign: "right" },
    totalsSection: {
      marginTop: 16,
      alignItems: "flex-end",
    },
    totalsRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 3,
      minWidth: 200,
    },
    totalsLabel: {
      flex: 1,
      textAlign: "right",
      paddingRight: 16,
      color: "#6b7280",
    },
    totalsValue: {
      width: 90,
      textAlign: "right",
    },
    totalFinal: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 6,
      paddingTop: 6,
      borderTop: "1.5 solid #1a1a1a",
      minWidth: 200,
    },
    totalFinalLabel: {
      flex: 1,
      textAlign: "right",
      paddingRight: 16,
      fontFamily: boldFamily,
      fontSize: 11,
    },
    totalFinalValue: {
      width: 90,
      textAlign: "right",
      fontFamily: boldFamily,
      fontSize: 11,
    },
    notes: {
      marginTop: 24,
      padding: 12,
      backgroundColor: "#f9fafb",
      borderRadius: 3,
    },
    notesLabel: {
      fontSize: 8,
      color: "#6b7280",
      textTransform: "uppercase",
      marginBottom: 4,
    },
    statusBadge: {
      fontSize: 9,
      padding: "3 8",
      borderRadius: 10,
      marginTop: 4,
    },
    footer: {
      marginTop: 32,
      paddingTop: 12,
      borderTop: "1 solid #e5e7eb",
      fontSize: 8,
      color: "#9ca3af",
      textAlign: "center",
    },
  });

  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          {config.showLogo && invoice.organization.logoUrl ? (
            <Image
              src={invoice.organization.logoUrl}
              style={{
                height: 40,
                maxWidth: 160,
                marginBottom: 4,
                objectFit: "contain",
              }}
            />
          ) : null}
          <Text style={styles.orgName}>{invoice.organization.name}</Text>
        </View>
        <View style={styles.invoiceMeta}>
          <Text style={[styles.invoiceTitle, { color: accentColor }]}>
            {typeLabel[invoice.type] ?? "INVOICE"}
          </Text>
          <Text style={styles.invoiceNumber}>#{invoice.number}</Text>
          <Text style={[styles.statusBadge, { color: "#6b7280" }]}>
            {invoice.status.replace("_", " ")}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Bill To + Dates */}
      <View style={styles.twoCol}>
        <View>
          <Text style={styles.label}>Bill To</Text>
          <Text style={[styles.value, { fontFamily: boldFamily }]}>
            {invoice.client.name}
          </Text>
          {invoice.client.email ? (
            <Text style={styles.value}>{invoice.client.email}</Text>
          ) : null}
          {invoice.client.address ? (
            <Text style={styles.value}>{invoice.client.address}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.label}>Date</Text>
          <Text style={[styles.value, { marginBottom: 8 }]}>
            {formatDate(invoice.date)}
          </Text>
          {invoice.dueDate ? (
            <>
              <Text style={styles.label}>Due Date</Text>
              <Text style={styles.value}>{formatDate(invoice.dueDate)}</Text>
            </>
          ) : null}
        </View>
      </View>

      {/* Line Items Table */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colName, { fontFamily: boldFamily, fontSize: 9 }]}>
          Description
        </Text>
        <Text style={[styles.colQty, { fontFamily: boldFamily, fontSize: 9 }]}>
          Qty
        </Text>
        <Text style={[styles.colRate, { fontFamily: boldFamily, fontSize: 9 }]}>
          Rate
        </Text>
        <Text style={[styles.colAmount, { fontFamily: boldFamily, fontSize: 9 }]}>
          Amount
        </Text>
      </View>

      {invoice.lines
        .sort((a, b) => a.sort - b.sort)
        .map((line) => (
          <View key={line.id} style={styles.tableRow}>
            <View style={styles.colName}>
              <Text style={{ fontFamily: boldFamily }}>{line.name}</Text>
              {line.description ? (
                <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
                  {line.description}
                </Text>
              ) : null}
            </View>
            <Text style={styles.colQty}>{Number(line.qty).toFixed(2)}</Text>
            <Text style={styles.colRate}>{fmt(line.rate)}</Text>
            <Text style={styles.colAmount}>{fmt(line.subtotal)}</Text>
          </View>
        ))}

      {/* Totals */}
      <View style={styles.totalsSection}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Subtotal</Text>
          <Text style={styles.totalsValue}>{fmt(invoice.subtotal)}</Text>
        </View>

        {invoice.discountType && Number(invoice.discountAmount) > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>
              Invoice Discount
              {invoice.discountType === "percentage"
                ? ` (${Number(invoice.discountAmount)}%)`
                : ""}
            </Text>
            <Text style={styles.totalsValue}>
              -
              {fmt(
                invoice.discountType === "percentage"
                  ? (Number(invoice.subtotal) * Number(invoice.discountAmount)) /
                      100
                  : Number(invoice.discountAmount)
              )}
            </Text>
          </View>
        )}

        {Number(invoice.discountTotal) > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total Discount</Text>
            <Text style={styles.totalsValue}>
              -{fmt(invoice.discountTotal)}
            </Text>
          </View>
        )}

        {Number(invoice.taxTotal) > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax</Text>
            <Text style={styles.totalsValue}>{fmt(invoice.taxTotal)}</Text>
          </View>
        )}

        <View style={styles.totalFinal}>
          <Text style={styles.totalFinalLabel}>Total</Text>
          <Text style={styles.totalFinalValue}>{fmt(invoice.total)}</Text>
        </View>
      </View>

      {/* Notes */}
      {invoice.notes && (
        <View style={styles.notes}>
          <Text style={styles.notesLabel}>Notes</Text>
          <Text style={{ fontSize: 9 }}>{invoice.notes}</Text>
        </View>
      )}

      {/* Payment Schedule */}
      {invoice.partialPayments.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={[styles.label, { marginBottom: 6 }]}>
            Payment Schedule
          </Text>
          {invoice.partialPayments.map((pp, i) => (
            <View
              key={pp.id}
              style={[
                styles.totalsRow,
                { minWidth: "auto" as unknown as number, justifyContent: "space-between" },
              ]}
            >
              <Text style={{ color: "#6b7280" }}>
                #{i + 1} · {formatDate(pp.dueDate)}
                {pp.isPaid ? " · Paid" : " · Pending"}
              </Text>
              <Text>
                {pp.isPercentage
                  ? `${Number(pp.amount).toFixed(0)}%`
                  : fmt(pp.amount)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Payment History */}
      {invoice.payments.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={[styles.label, { marginBottom: 6 }]}>
            Payment History
          </Text>
          {invoice.payments.map((p) => (
            <View
              key={p.id}
              style={[
                styles.totalsRow,
                { minWidth: "auto" as unknown as number, justifyContent: "space-between" },
              ]}
            >
              <Text style={{ color: "#6b7280" }}>
                {formatDate(p.paidAt)} · {p.method}
              </Text>
              <Text>{fmt(p.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Late Fees */}
      {invoice.lateFeeEntries &&
        invoice.lateFeeEntries.filter((e) => !e.isWaived).length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={[styles.label, { marginBottom: 6 }]}>Late Fees</Text>
            {invoice.lateFeeEntries
              .filter((e) => !e.isWaived)
              .map((entry) => (
                <View
                  key={entry.id}
                  style={[
                    styles.totalsRow,
                    { minWidth: "auto" as unknown as number, justifyContent: "space-between" },
                  ]}
                >
                  <Text style={{ color: "#6b7280" }}>
                    {formatDate(entry.createdAt)} ·{" "}
                    {entry.feeType === "percentage"
                      ? `${Number(entry.feeRate)}%`
                      : "Flat fee"}
                  </Text>
                  <Text>{fmt(entry.amount)}</Text>
                </View>
              ))}
            <View
              style={[
                styles.totalsRow,
                {
                  minWidth: "auto" as unknown as number,
                  justifyContent: "space-between",
                  borderTop: "1 solid #e5e7eb",
                  paddingTop: 4,
                  marginTop: 4,
                },
              ]}
            >
              <Text style={{ fontFamily: boldFamily, fontSize: 10 }}>
                Late Fee Total
              </Text>
              <Text style={{ fontFamily: boldFamily, fontSize: 10 }}>
                {fmt(
                  invoice.lateFeeEntries
                    .filter((e) => !e.isWaived)
                    .reduce((sum, e) => sum + Number(e.amount), 0)
                )}
              </Text>
            </View>
          </View>
        )}

      {/* Footer */}
      {config.footerText && (
        <View style={styles.footer}>
          <Text>{config.footerText}</Text>
        </View>
      )}
    </Page>
  );
}
```

**Commit:**
```bash
git add src/server/services/pdf-templates/modern.tsx
git commit -m "feat(D2.5): extract Modern PDF template from existing InvoiceDocument"
```

---

### Task D2.6 — Classic Template

**New File:** `src/server/services/pdf-templates/classic.tsx`

Traditional, formal layout with ruled lines, serif-friendly. Key differences from Modern:
- No rounded corners or colored backgrounds on table header
- Full horizontal rules between sections
- Org info and invoice meta are more formally structured (left-aligned stacked)
- Accent color used only for the total amount line and org name

```tsx
import {
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import React from "react";
import type { TemplateProps } from "./types";
import { formatAmount, formatDate } from "../pdf-shared";

export function ClassicTemplate({ invoice, config }: TemplateProps) {
  const sym = invoice.currency.symbol;
  const symPos = invoice.currency.symbolPosition;
  const fmt = (n: number | string | { toNumber(): number }) =>
    formatAmount(n, sym, symPos);

  const typeLabel: Record<string, string> = {
    SIMPLE: "INVOICE",
    DETAILED: "INVOICE",
    ESTIMATE: "ESTIMATE",
    CREDIT_NOTE: "CREDIT NOTE",
  };

  const fontFamily = config.fontFamily;
  const boldFamily = `${fontFamily}-Bold`;
  const accentColor = config.accentColor;

  const styles = StyleSheet.create({
    page: {
      fontFamily,
      fontSize: 10,
      padding: 56,
      color: "#1a1a1a",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: 16,
      borderBottom: "2 solid #1a1a1a",
      marginBottom: 24,
    },
    orgName: {
      fontSize: 20,
      fontFamily: boldFamily,
      color: accentColor,
      marginBottom: 4,
    },
    invoiceTitle: {
      fontSize: 14,
      fontFamily: boldFamily,
      textTransform: "uppercase",
      letterSpacing: 2,
    },
    invoiceNumber: {
      fontSize: 11,
      color: "#555",
      marginTop: 2,
    },
    rule: {
      borderBottom: "0.5 solid #d1d5db",
      marginVertical: 12,
    },
    thickRule: {
      borderBottom: "1 solid #1a1a1a",
      marginVertical: 12,
    },
    twoCol: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 20,
    },
    label: {
      fontSize: 9,
      color: "#6b7280",
      textTransform: "uppercase",
      marginBottom: 3,
      letterSpacing: 0.5,
    },
    value: {
      fontSize: 10,
    },
    tableHeader: {
      flexDirection: "row",
      borderBottom: "1 solid #1a1a1a",
      paddingBottom: 4,
      marginBottom: 2,
    },
    tableRow: {
      flexDirection: "row",
      padding: "4 0",
      borderBottom: "0.5 solid #e5e7eb",
    },
    colName: { flex: 3 },
    colQty: { flex: 1, textAlign: "right" },
    colRate: { flex: 1.5, textAlign: "right" },
    colAmount: { flex: 1.5, textAlign: "right" },
    totalsSection: {
      marginTop: 16,
      alignItems: "flex-end",
    },
    totalsRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 3,
      minWidth: 200,
    },
    totalsLabel: {
      flex: 1,
      textAlign: "right",
      paddingRight: 16,
      color: "#6b7280",
    },
    totalsValue: {
      width: 90,
      textAlign: "right",
    },
    totalFinal: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 8,
      paddingTop: 8,
      borderTop: "2 solid #1a1a1a",
      minWidth: 200,
    },
    totalFinalLabel: {
      flex: 1,
      textAlign: "right",
      paddingRight: 16,
      fontFamily: boldFamily,
      fontSize: 12,
    },
    totalFinalValue: {
      width: 90,
      textAlign: "right",
      fontFamily: boldFamily,
      fontSize: 12,
      color: accentColor,
    },
    notes: {
      marginTop: 24,
      borderTop: "0.5 solid #d1d5db",
      paddingTop: 12,
    },
    notesLabel: {
      fontSize: 9,
      color: "#6b7280",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    footer: {
      marginTop: 32,
      paddingTop: 12,
      borderTop: "0.5 solid #d1d5db",
      fontSize: 8,
      color: "#9ca3af",
      textAlign: "center",
    },
  });

  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          {config.showLogo && invoice.organization.logoUrl ? (
            <Image
              src={invoice.organization.logoUrl}
              style={{
                height: 36,
                maxWidth: 140,
                marginBottom: 4,
                objectFit: "contain",
              }}
            />
          ) : null}
          <Text style={styles.orgName}>{invoice.organization.name}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.invoiceTitle}>
            {typeLabel[invoice.type] ?? "INVOICE"}
          </Text>
          <Text style={styles.invoiceNumber}>#{invoice.number}</Text>
          <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
            {invoice.status.replace("_", " ")}
          </Text>
        </View>
      </View>

      {/* Bill To + Dates */}
      <View style={styles.twoCol}>
        <View>
          <Text style={styles.label}>Bill To</Text>
          <Text style={[styles.value, { fontFamily: boldFamily }]}>
            {invoice.client.name}
          </Text>
          {invoice.client.email ? (
            <Text style={styles.value}>{invoice.client.email}</Text>
          ) : null}
          {invoice.client.address ? (
            <Text style={styles.value}>{invoice.client.address}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.label}>Date</Text>
          <Text style={[styles.value, { marginBottom: 8 }]}>
            {formatDate(invoice.date)}
          </Text>
          {invoice.dueDate ? (
            <>
              <Text style={styles.label}>Due Date</Text>
              <Text style={styles.value}>{formatDate(invoice.dueDate)}</Text>
            </>
          ) : null}
        </View>
      </View>

      {/* Line Items Table */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colName, { fontFamily: boldFamily, fontSize: 9 }]}>
          Description
        </Text>
        <Text style={[styles.colQty, { fontFamily: boldFamily, fontSize: 9 }]}>
          Qty
        </Text>
        <Text style={[styles.colRate, { fontFamily: boldFamily, fontSize: 9 }]}>
          Rate
        </Text>
        <Text style={[styles.colAmount, { fontFamily: boldFamily, fontSize: 9 }]}>
          Amount
        </Text>
      </View>

      {invoice.lines
        .sort((a, b) => a.sort - b.sort)
        .map((line) => (
          <View key={line.id} style={styles.tableRow}>
            <View style={styles.colName}>
              <Text style={{ fontFamily: boldFamily }}>{line.name}</Text>
              {line.description ? (
                <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
                  {line.description}
                </Text>
              ) : null}
            </View>
            <Text style={styles.colQty}>{Number(line.qty).toFixed(2)}</Text>
            <Text style={styles.colRate}>{fmt(line.rate)}</Text>
            <Text style={styles.colAmount}>{fmt(line.subtotal)}</Text>
          </View>
        ))}

      {/* Totals */}
      <View style={styles.totalsSection}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Subtotal</Text>
          <Text style={styles.totalsValue}>{fmt(invoice.subtotal)}</Text>
        </View>

        {invoice.discountType && Number(invoice.discountAmount) > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>
              Discount
              {invoice.discountType === "percentage"
                ? ` (${Number(invoice.discountAmount)}%)`
                : ""}
            </Text>
            <Text style={styles.totalsValue}>
              -
              {fmt(
                invoice.discountType === "percentage"
                  ? (Number(invoice.subtotal) * Number(invoice.discountAmount)) /
                      100
                  : Number(invoice.discountAmount)
              )}
            </Text>
          </View>
        )}

        {Number(invoice.taxTotal) > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax</Text>
            <Text style={styles.totalsValue}>{fmt(invoice.taxTotal)}</Text>
          </View>
        )}

        <View style={styles.totalFinal}>
          <Text style={styles.totalFinalLabel}>Total Due</Text>
          <Text style={styles.totalFinalValue}>{fmt(invoice.total)}</Text>
        </View>
      </View>

      {/* Notes */}
      {invoice.notes && (
        <View style={styles.notes}>
          <Text style={styles.notesLabel}>Notes</Text>
          <Text style={{ fontSize: 9 }}>{invoice.notes}</Text>
        </View>
      )}

      {/* Payment History */}
      {invoice.payments.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={[styles.label, { marginBottom: 6 }]}>
            Payment History
          </Text>
          {invoice.payments.map((p) => (
            <View
              key={p.id}
              style={[
                styles.totalsRow,
                { minWidth: "auto" as unknown as number, justifyContent: "space-between" },
              ]}
            >
              <Text style={{ color: "#6b7280" }}>
                {formatDate(p.paidAt)} · {p.method}
              </Text>
              <Text>{fmt(p.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Footer */}
      {config.footerText && (
        <View style={styles.footer}>
          <Text>{config.footerText}</Text>
        </View>
      )}
    </Page>
  );
}
```

**Commit:**
```bash
git add src/server/services/pdf-templates/classic.tsx
git commit -m "feat(D2.6): add Classic invoice PDF template"
```

---

### Task D2.7 — Minimal Template

**New File:** `src/server/services/pdf-templates/minimal.tsx`

Clean, sparse layout. Key characteristics:
- Very generous whitespace
- No table header background
- Subtle dotted separators
- Large, centered total
- Accent color used only for the total amount

```tsx
import {
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import React from "react";
import type { TemplateProps } from "./types";
import { formatAmount, formatDate } from "../pdf-shared";

export function MinimalTemplate({ invoice, config }: TemplateProps) {
  const sym = invoice.currency.symbol;
  const symPos = invoice.currency.symbolPosition;
  const fmt = (n: number | string | { toNumber(): number }) =>
    formatAmount(n, sym, symPos);

  const typeLabel: Record<string, string> = {
    SIMPLE: "Invoice",
    DETAILED: "Invoice",
    ESTIMATE: "Estimate",
    CREDIT_NOTE: "Credit Note",
  };

  const fontFamily = config.fontFamily;
  const boldFamily = `${fontFamily}-Bold`;
  const accentColor = config.accentColor;

  const styles = StyleSheet.create({
    page: {
      fontFamily,
      fontSize: 10,
      padding: 56,
      color: "#374151",
    },
    header: {
      marginBottom: 40,
    },
    orgName: {
      fontSize: 14,
      fontFamily: boldFamily,
      color: "#111827",
      marginBottom: 2,
    },
    invoiceLabel: {
      fontSize: 10,
      color: "#9ca3af",
      marginTop: 16,
    },
    invoiceNumber: {
      fontSize: 20,
      fontFamily: boldFamily,
      color: "#111827",
      marginTop: 2,
    },
    dotted: {
      borderBottom: "1 dotted #d1d5db",
      marginVertical: 20,
    },
    twoCol: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 28,
    },
    label: {
      fontSize: 9,
      color: "#9ca3af",
      marginBottom: 3,
    },
    value: {
      fontSize: 10,
      color: "#374151",
    },
    lineItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      padding: "8 0",
      borderBottom: "1 dotted #e5e7eb",
    },
    totalBlock: {
      marginTop: 24,
      alignItems: "flex-end",
    },
    totalLabel: {
      fontSize: 10,
      color: "#9ca3af",
      marginBottom: 4,
    },
    totalValue: {
      fontSize: 28,
      fontFamily: boldFamily,
      color: accentColor,
    },
    notes: {
      marginTop: 32,
    },
    footer: {
      marginTop: 40,
      fontSize: 8,
      color: "#9ca3af",
      textAlign: "center",
    },
  });

  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        {config.showLogo && invoice.organization.logoUrl ? (
          <Image
            src={invoice.organization.logoUrl}
            style={{
              height: 32,
              maxWidth: 120,
              marginBottom: 8,
              objectFit: "contain",
            }}
          />
        ) : null}
        <Text style={styles.orgName}>{invoice.organization.name}</Text>
        <Text style={styles.invoiceLabel}>
          {typeLabel[invoice.type] ?? "Invoice"}
        </Text>
        <Text style={styles.invoiceNumber}>#{invoice.number}</Text>
      </View>

      <View style={styles.dotted} />

      {/* Bill To + Dates */}
      <View style={styles.twoCol}>
        <View>
          <Text style={styles.label}>To</Text>
          <Text style={[styles.value, { fontFamily: boldFamily }]}>
            {invoice.client.name}
          </Text>
          {invoice.client.email ? (
            <Text style={styles.value}>{invoice.client.email}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{formatDate(invoice.date)}</Text>
          {invoice.dueDate ? (
            <>
              <Text style={[styles.label, { marginTop: 8 }]}>Due</Text>
              <Text style={styles.value}>{formatDate(invoice.dueDate)}</Text>
            </>
          ) : null}
        </View>
      </View>

      {/* Line Items — simplified list */}
      {invoice.lines
        .sort((a, b) => a.sort - b.sort)
        .map((line) => (
          <View key={line.id} style={styles.lineItem}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: boldFamily, color: "#111827" }}>
                {line.name}
              </Text>
              {line.description ? (
                <Text style={{ fontSize: 9, color: "#9ca3af", marginTop: 1 }}>
                  {line.description}
                </Text>
              ) : null}
              <Text style={{ fontSize: 9, color: "#9ca3af", marginTop: 1 }}>
                {Number(line.qty).toFixed(2)} x {fmt(line.rate)}
              </Text>
            </View>
            <Text style={{ fontFamily: boldFamily, color: "#111827" }}>
              {fmt(line.subtotal)}
            </Text>
          </View>
        ))}

      {/* Total */}
      <View style={styles.totalBlock}>
        {Number(invoice.taxTotal) > 0 && (
          <Text style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>
            Includes {fmt(invoice.taxTotal)} tax
          </Text>
        )}
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{fmt(invoice.total)}</Text>
      </View>

      {/* Notes */}
      {invoice.notes && (
        <View style={styles.notes}>
          <Text style={{ fontSize: 9, color: "#9ca3af", marginBottom: 4 }}>
            Notes
          </Text>
          <Text style={{ fontSize: 9, color: "#374151" }}>
            {invoice.notes}
          </Text>
        </View>
      )}

      {/* Payment History */}
      {invoice.payments.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 9, color: "#9ca3af", marginBottom: 6 }}>
            Payments
          </Text>
          {invoice.payments.map((p) => (
            <View
              key={p.id}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 3,
              }}
            >
              <Text style={{ fontSize: 9, color: "#6b7280" }}>
                {formatDate(p.paidAt)} · {p.method}
              </Text>
              <Text style={{ fontSize: 9 }}>{fmt(p.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Footer */}
      {config.footerText && (
        <View style={styles.footer}>
          <Text>{config.footerText}</Text>
        </View>
      )}
    </Page>
  );
}
```

**Commit:**
```bash
git add src/server/services/pdf-templates/minimal.tsx
git commit -m "feat(D2.7): add Minimal invoice PDF template"
```

---

### Task D2.8 — Compact Template

**New File:** `src/server/services/pdf-templates/compact.tsx`

Dense layout for information-heavy invoices. Key characteristics:
- Smaller font sizes (8-9pt body)
- Tighter spacing
- Full table grid with visible borders
- Ideal for invoices with many line items
- Side-by-side org + client info in a compact header

```tsx
import {
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import React from "react";
import type { TemplateProps } from "./types";
import { formatAmount, formatDate } from "../pdf-shared";

export function CompactTemplate({ invoice, config }: TemplateProps) {
  const sym = invoice.currency.symbol;
  const symPos = invoice.currency.symbolPosition;
  const fmt = (n: number | string | { toNumber(): number }) =>
    formatAmount(n, sym, symPos);

  const typeLabel: Record<string, string> = {
    SIMPLE: "INVOICE",
    DETAILED: "INVOICE",
    ESTIMATE: "ESTIMATE",
    CREDIT_NOTE: "CREDIT NOTE",
  };

  const fontFamily = config.fontFamily;
  const boldFamily = `${fontFamily}-Bold`;
  const accentColor = config.accentColor;

  const styles = StyleSheet.create({
    page: {
      fontFamily,
      fontSize: 8,
      padding: 36,
      color: "#1a1a1a",
    },
    headerBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: accentColor,
      padding: "10 16",
      borderRadius: 4,
      marginBottom: 16,
    },
    headerTitle: {
      fontSize: 14,
      fontFamily: boldFamily,
      color: "#ffffff",
    },
    headerNumber: {
      fontSize: 10,
      color: "#ffffff",
    },
    infoGrid: {
      flexDirection: "row",
      marginBottom: 16,
      gap: 16,
    },
    infoBox: {
      flex: 1,
      padding: "8 10",
      backgroundColor: "#f9fafb",
      borderRadius: 3,
    },
    label: {
      fontSize: 7,
      color: "#6b7280",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    value: {
      fontSize: 8,
    },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: "#f3f4f6",
      padding: "4 6",
      borderTop: "1 solid #d1d5db",
      borderBottom: "1 solid #d1d5db",
    },
    tableRow: {
      flexDirection: "row",
      padding: "3 6",
      borderBottom: "0.5 solid #e5e7eb",
    },
    colName: { flex: 3 },
    colQty: { flex: 0.8, textAlign: "right" },
    colRate: { flex: 1.2, textAlign: "right" },
    colTax: { flex: 1, textAlign: "right" },
    colAmount: { flex: 1.2, textAlign: "right" },
    totalsSection: {
      marginTop: 8,
      alignItems: "flex-end",
    },
    totalsRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 2,
      minWidth: 180,
    },
    totalsLabel: {
      flex: 1,
      textAlign: "right",
      paddingRight: 12,
      color: "#6b7280",
      fontSize: 8,
    },
    totalsValue: {
      width: 80,
      textAlign: "right",
      fontSize: 8,
    },
    totalFinal: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 4,
      paddingTop: 4,
      borderTop: "1.5 solid #1a1a1a",
      minWidth: 180,
    },
    totalFinalLabel: {
      flex: 1,
      textAlign: "right",
      paddingRight: 12,
      fontFamily: boldFamily,
      fontSize: 10,
    },
    totalFinalValue: {
      width: 80,
      textAlign: "right",
      fontFamily: boldFamily,
      fontSize: 10,
      color: accentColor,
    },
    footer: {
      marginTop: 20,
      paddingTop: 8,
      borderTop: "0.5 solid #e5e7eb",
      fontSize: 7,
      color: "#9ca3af",
      textAlign: "center",
    },
  });

  return (
    <Page size="A4" style={styles.page}>
      {/* Colored header bar */}
      <View style={styles.headerBar}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {config.showLogo && invoice.organization.logoUrl ? (
            <Image
              src={invoice.organization.logoUrl}
              style={{ height: 24, maxWidth: 80, objectFit: "contain" }}
            />
          ) : null}
          <Text style={styles.headerTitle}>
            {typeLabel[invoice.type] ?? "INVOICE"}
          </Text>
        </View>
        <Text style={styles.headerNumber}>#{invoice.number}</Text>
      </View>

      {/* Info grid: From / To / Details */}
      <View style={styles.infoGrid}>
        <View style={styles.infoBox}>
          <Text style={styles.label}>From</Text>
          <Text style={[styles.value, { fontFamily: boldFamily }]}>
            {invoice.organization.name}
          </Text>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.label}>Bill To</Text>
          <Text style={[styles.value, { fontFamily: boldFamily }]}>
            {invoice.client.name}
          </Text>
          {invoice.client.email ? (
            <Text style={styles.value}>{invoice.client.email}</Text>
          ) : null}
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{formatDate(invoice.date)}</Text>
          {invoice.dueDate ? (
            <>
              <Text style={[styles.label, { marginTop: 4 }]}>Due</Text>
              <Text style={styles.value}>{formatDate(invoice.dueDate)}</Text>
            </>
          ) : null}
          <Text style={[styles.label, { marginTop: 4 }]}>Status</Text>
          <Text style={styles.value}>
            {invoice.status.replace("_", " ")}
          </Text>
        </View>
      </View>

      {/* Line Items Table with tax column */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colName, { fontFamily: boldFamily, fontSize: 7 }]}>
          Item
        </Text>
        <Text style={[styles.colQty, { fontFamily: boldFamily, fontSize: 7 }]}>
          Qty
        </Text>
        <Text style={[styles.colRate, { fontFamily: boldFamily, fontSize: 7 }]}>
          Rate
        </Text>
        <Text style={[styles.colTax, { fontFamily: boldFamily, fontSize: 7 }]}>
          Tax
        </Text>
        <Text style={[styles.colAmount, { fontFamily: boldFamily, fontSize: 7 }]}>
          Amount
        </Text>
      </View>

      {invoice.lines
        .sort((a, b) => a.sort - b.sort)
        .map((line) => {
          const lineTax = line.taxes.reduce(
            (sum, t) => sum + Number(t.amount),
            0
          );
          return (
            <View key={line.id} style={styles.tableRow}>
              <View style={styles.colName}>
                <Text>{line.name}</Text>
                {line.description ? (
                  <Text style={{ fontSize: 7, color: "#6b7280" }}>
                    {line.description}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.colQty}>{Number(line.qty).toFixed(2)}</Text>
              <Text style={styles.colRate}>{fmt(line.rate)}</Text>
              <Text style={styles.colTax}>
                {lineTax > 0 ? fmt(lineTax) : "—"}
              </Text>
              <Text style={styles.colAmount}>{fmt(line.subtotal)}</Text>
            </View>
          );
        })}

      {/* Totals */}
      <View style={styles.totalsSection}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Subtotal</Text>
          <Text style={styles.totalsValue}>{fmt(invoice.subtotal)}</Text>
        </View>

        {invoice.discountType && Number(invoice.discountAmount) > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>
              Discount
              {invoice.discountType === "percentage"
                ? ` (${Number(invoice.discountAmount)}%)`
                : ""}
            </Text>
            <Text style={styles.totalsValue}>
              -
              {fmt(
                invoice.discountType === "percentage"
                  ? (Number(invoice.subtotal) * Number(invoice.discountAmount)) /
                      100
                  : Number(invoice.discountAmount)
              )}
            </Text>
          </View>
        )}

        {Number(invoice.taxTotal) > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax</Text>
            <Text style={styles.totalsValue}>{fmt(invoice.taxTotal)}</Text>
          </View>
        )}

        <View style={styles.totalFinal}>
          <Text style={styles.totalFinalLabel}>Total</Text>
          <Text style={styles.totalFinalValue}>{fmt(invoice.total)}</Text>
        </View>
      </View>

      {/* Notes */}
      {invoice.notes && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 7, color: "#6b7280", marginBottom: 2 }}>
            NOTES
          </Text>
          <Text style={{ fontSize: 7 }}>{invoice.notes}</Text>
        </View>
      )}

      {/* Payment Schedule + History — side by side if both exist */}
      {(invoice.partialPayments.length > 0 ||
        invoice.payments.length > 0) && (
        <View style={{ flexDirection: "row", marginTop: 12, gap: 16 }}>
          {invoice.partialPayments.length > 0 && (
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 7,
                  color: "#6b7280",
                  marginBottom: 4,
                  textTransform: "uppercase",
                }}
              >
                Payment Schedule
              </Text>
              {invoice.partialPayments.map((pp, i) => (
                <View
                  key={pp.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 2,
                  }}
                >
                  <Text style={{ color: "#6b7280", fontSize: 7 }}>
                    #{i + 1} · {formatDate(pp.dueDate)}
                    {pp.isPaid ? " · Paid" : ""}
                  </Text>
                  <Text style={{ fontSize: 7 }}>
                    {pp.isPercentage
                      ? `${Number(pp.amount).toFixed(0)}%`
                      : fmt(pp.amount)}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {invoice.payments.length > 0 && (
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 7,
                  color: "#6b7280",
                  marginBottom: 4,
                  textTransform: "uppercase",
                }}
              >
                Payment History
              </Text>
              {invoice.payments.map((p) => (
                <View
                  key={p.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 2,
                  }}
                >
                  <Text style={{ color: "#6b7280", fontSize: 7 }}>
                    {formatDate(p.paidAt)} · {p.method}
                  </Text>
                  <Text style={{ fontSize: 7 }}>{fmt(p.amount)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Footer */}
      {config.footerText && (
        <View style={styles.footer}>
          <Text>{config.footerText}</Text>
        </View>
      )}
    </Page>
  );
}
```

**Commit:**
```bash
git add src/server/services/pdf-templates/compact.tsx
git commit -m "feat(D2.8): add Compact invoice PDF template"
```

---

### Task D2.9 — Template Registry and Updated PDF Generation

**New File:** `src/server/services/pdf-templates/index.ts`

Registry that maps template names to their components.

```typescript
import type { TemplateProps } from "./types";
export type { TemplateProps } from "./types";

import { ModernTemplate } from "./modern";
import { ClassicTemplate } from "./classic";
import { MinimalTemplate } from "./minimal";
import { CompactTemplate } from "./compact";

export const TEMPLATE_REGISTRY: Record<
  string,
  React.FC<TemplateProps>
> = {
  modern: ModernTemplate,
  classic: ClassicTemplate,
  minimal: MinimalTemplate,
  compact: CompactTemplate,
};

export { ModernTemplate, ClassicTemplate, MinimalTemplate, CompactTemplate };
```

**Updated File:** `src/server/services/invoice-pdf.tsx`

Replace the current monolithic `InvoiceDocument` with a dispatcher that picks the right template.

```tsx
import {
  Document,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";
import type { Invoice, InvoiceLine, InvoiceLineTax, Tax, Client, Currency, Organization, Payment, PartialPayment, LateFeeEntry } from "@/generated/prisma";
import { getInvoiceTemplateConfig } from "./invoice-template-config";
import { TEMPLATE_REGISTRY } from "./pdf-templates";

export type FullInvoice = Invoice & {
  client: Client;
  currency: Currency;
  organization: Organization;
  lines: (InvoiceLine & { taxes: (InvoiceLineTax & { tax: Tax })[] })[];
  payments: Payment[];
  partialPayments: PartialPayment[];
  lateFeeEntries?: LateFeeEntry[];
};

function InvoiceDocument({ invoice }: { invoice: FullInvoice }) {
  const config = getInvoiceTemplateConfig(invoice.organization);
  const TemplateComponent = TEMPLATE_REGISTRY[config.template] ?? TEMPLATE_REGISTRY.modern;

  return (
    <Document>
      <TemplateComponent invoice={invoice} config={config} />
    </Document>
  );
}

export async function generateInvoicePDF(invoice: FullInvoice): Promise<Buffer> {
  const buffer = await renderToBuffer(<InvoiceDocument invoice={invoice} />);
  return Buffer.from(buffer);
}
```

This is a **breaking refactor** of the existing file. The old 370-line `InvoiceDocument` is fully replaced by the dispatcher + the `ModernTemplate` component (which contains the identical layout).

**Commit:**
```bash
git add src/server/services/pdf-templates/index.ts src/server/services/invoice-pdf.tsx
git commit -m "feat(D2.9): refactor PDF generation to use template registry dispatch"
```

---

### Task D2.10 — Invoice Settings Page

**New File:** `src/app/(dashboard)/settings/invoices/page.tsx`

A dedicated settings sub-page for invoice template configuration with visual previews and a preview button.

```tsx
import { api } from "@/trpc/server";
import { InvoiceTemplateSettings } from "@/components/settings/InvoiceTemplateSettings";

export default async function InvoiceSettingsPage() {
  const org = await api.organization.get();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Invoice Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose your invoice PDF layout and customize its appearance.
          </p>
        </div>
      </div>

      <InvoiceTemplateSettings org={org} />
    </div>
  );
}
```

**New File:** `src/components/settings/InvoiceTemplateSettings.tsx`

```tsx
"use client";

import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

type Props = {
  org: {
    brandColor: string | null;
    logoUrl: string | null;
    invoiceTemplate: string;
    invoiceFontFamily: string | null;
    invoiceAccentColor: string | null;
    invoiceShowLogo: boolean;
    invoiceFooterText: string | null;
  };
};

const TEMPLATES = [
  {
    id: "modern",
    name: "Modern",
    description: "Clean and contemporary with rounded elements and color accents.",
    preview: (color: string) => (
      <div className="w-full h-full p-3 flex flex-col gap-2">
        <div className="flex justify-between items-start">
          <div className="w-8 h-2 rounded bg-muted-foreground/30" />
          <div className="w-12 h-4 rounded" style={{ backgroundColor: color }} />
        </div>
        <div className="h-px bg-border/50 my-1" />
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <div className="w-10 h-1.5 rounded bg-muted-foreground/20" />
            <div className="w-16 h-1.5 rounded bg-muted-foreground/30" />
          </div>
          <div className="space-y-1 text-right">
            <div className="w-10 h-1.5 rounded bg-muted-foreground/20 ml-auto" />
            <div className="w-14 h-1.5 rounded bg-muted-foreground/30 ml-auto" />
          </div>
        </div>
        <div className="rounded bg-muted/50 p-1.5 space-y-1 flex-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between">
              <div className="w-16 h-1 rounded bg-muted-foreground/20" />
              <div className="w-8 h-1 rounded bg-muted-foreground/20" />
            </div>
          ))}
        </div>
        <div className="text-right">
          <div className="w-14 h-2 rounded ml-auto" style={{ backgroundColor: color, opacity: 0.8 }} />
        </div>
      </div>
    ),
  },
  {
    id: "classic",
    name: "Classic",
    description: "Traditional and formal with ruled lines and structured layout.",
    preview: (color: string) => (
      <div className="w-full h-full p-3 flex flex-col gap-2">
        <div className="flex justify-between items-end pb-1.5 border-b-2 border-foreground/20">
          <div className="w-16 h-2.5 rounded" style={{ backgroundColor: color, opacity: 0.7 }} />
          <div className="space-y-0.5 text-right">
            <div className="w-12 h-1.5 rounded bg-muted-foreground/30 ml-auto" />
            <div className="w-8 h-1 rounded bg-muted-foreground/20 ml-auto" />
          </div>
        </div>
        <div className="flex gap-4 my-1">
          <div className="space-y-1">
            <div className="w-8 h-1 rounded bg-muted-foreground/20" />
            <div className="w-14 h-1.5 rounded bg-muted-foreground/30" />
          </div>
          <div className="space-y-1 ml-auto text-right">
            <div className="w-8 h-1 rounded bg-muted-foreground/20 ml-auto" />
            <div className="w-12 h-1.5 rounded bg-muted-foreground/30 ml-auto" />
          </div>
        </div>
        <div className="border-t border-b border-foreground/20 py-1 space-y-1 flex-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between border-b border-border/30 pb-0.5">
              <div className="w-16 h-1 rounded bg-muted-foreground/20" />
              <div className="w-8 h-1 rounded bg-muted-foreground/20" />
            </div>
          ))}
        </div>
        <div className="text-right border-t-2 border-foreground/20 pt-1">
          <div className="w-12 h-2 rounded ml-auto" style={{ backgroundColor: color, opacity: 0.6 }} />
        </div>
      </div>
    ),
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Sparse and clean with generous whitespace and subtle details.",
    preview: (color: string) => (
      <div className="w-full h-full p-4 flex flex-col gap-3">
        <div>
          <div className="w-10 h-1.5 rounded bg-muted-foreground/30" />
          <div className="w-6 h-1 rounded bg-muted-foreground/15 mt-2" />
          <div className="w-14 h-2.5 rounded bg-muted-foreground/30 mt-0.5" />
        </div>
        <div className="border-b border-dotted border-border" />
        <div className="space-y-2 flex-1">
          {[1, 2].map((i) => (
            <div key={i} className="flex justify-between border-b border-dotted border-border/50 pb-1.5">
              <div className="space-y-0.5">
                <div className="w-14 h-1 rounded bg-muted-foreground/25" />
                <div className="w-8 h-0.5 rounded bg-muted-foreground/15" />
              </div>
              <div className="w-8 h-1 rounded bg-muted-foreground/25" />
            </div>
          ))}
        </div>
        <div className="text-right">
          <div className="w-6 h-0.5 rounded bg-muted-foreground/15 ml-auto" />
          <div className="w-16 h-3 rounded ml-auto mt-0.5" style={{ backgroundColor: color, opacity: 0.7 }} />
        </div>
      </div>
    ),
  },
  {
    id: "compact",
    name: "Compact",
    description: "Dense layout with more data per page, great for detailed invoices.",
    preview: (color: string) => (
      <div className="w-full h-full p-2 flex flex-col gap-1.5">
        <div className="rounded px-2 py-1.5 flex justify-between items-center" style={{ backgroundColor: color }}>
          <div className="w-10 h-1.5 rounded bg-white/70" />
          <div className="w-6 h-1 rounded bg-white/50" />
        </div>
        <div className="flex gap-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-1 rounded bg-muted/50 p-1 space-y-0.5">
              <div className="w-6 h-0.5 rounded bg-muted-foreground/20" />
              <div className="w-10 h-1 rounded bg-muted-foreground/30" />
            </div>
          ))}
        </div>
        <div className="border border-border/50 rounded flex-1">
          <div className="bg-muted/30 px-1.5 py-0.5 flex gap-1">
            {["w-8", "w-4", "w-4", "w-4", "w-4"].map((w, i) => (
              <div key={i} className={`${w} h-0.5 rounded bg-muted-foreground/25`} />
            ))}
          </div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="px-1.5 py-0.5 border-b border-border/30 flex gap-1">
              <div className="w-8 h-0.5 rounded bg-muted-foreground/15" />
              <div className="w-4 h-0.5 rounded bg-muted-foreground/15 ml-auto" />
            </div>
          ))}
        </div>
        <div className="text-right">
          <div className="w-10 h-1.5 rounded ml-auto" style={{ backgroundColor: color, opacity: 0.7 }} />
        </div>
      </div>
    ),
  },
] as const;

const FONT_OPTIONS = [
  { value: "helvetica", label: "Helvetica (Sans-serif)" },
  { value: "georgia", label: "Georgia (Serif)" },
  { value: "courier", label: "Courier (Monospace)" },
];

export function InvoiceTemplateSettings({ org }: Props) {
  const utils = trpc.useUtils();
  const updateMutation = trpc.organization.update.useMutation({
    onSuccess: () => {
      void utils.organization.get.invalidate();
      toast.success("Invoice template settings saved");
    },
    onError: (err) => toast.error(err.message),
  });

  const [template, setTemplate] = useState(org.invoiceTemplate);
  const [fontFamily, setFontFamily] = useState(org.invoiceFontFamily ?? "helvetica");
  const [accentColor, setAccentColor] = useState(org.invoiceAccentColor ?? org.brandColor ?? "#2563eb");
  const [showLogo, setShowLogo] = useState(org.invoiceShowLogo);
  const [footerText, setFooterText] = useState(org.invoiceFooterText ?? "");

  function handleSave() {
    updateMutation.mutate({
      invoiceTemplate: template as "modern" | "classic" | "minimal" | "compact",
      invoiceFontFamily: fontFamily as "helvetica" | "georgia" | "courier",
      invoiceAccentColor: accentColor || null,
      invoiceShowLogo: showLogo,
      invoiceFooterText: footerText || null,
    });
  }

  return (
    <div className="space-y-6">
      {/* Template Picker */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Layout
          </p>
          <p className="text-base font-semibold mt-1">Invoice Template</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Choose a layout for your PDF invoices.
          </p>
        </div>
        <div className="px-6 py-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplate(t.id)}
                className={cn(
                  "relative rounded-xl border-2 p-0 overflow-hidden transition-all text-left",
                  template === t.id
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border/50 hover:border-border"
                )}
              >
                {/* Visual preview */}
                <div className="aspect-[8.5/11] bg-white relative">
                  {t.preview(accentColor)}
                  {template === t.id && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                <div className="px-3 py-2.5 border-t border-border/50">
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {t.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Customization */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Customization
          </p>
          <p className="text-base font-semibold mt-1">Template Options</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Fine-tune the appearance of your invoices.
          </p>
        </div>
        <div className="px-6 py-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Font */}
            <div className="space-y-1.5">
              <Label htmlFor="invoiceFont">Font Family</Label>
              <Select value={fontFamily} onValueChange={setFontFamily}>
                <SelectTrigger id="invoiceFont">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Accent Color */}
            <div className="space-y-1.5">
              <Label>Invoice Accent Color</Label>
              <p className="text-xs text-muted-foreground">
                Falls back to your brand color if not set.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-10 w-16 cursor-pointer rounded border p-0.5"
                />
                <Input
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#2563eb"
                  className="w-32 font-mono"
                  maxLength={7}
                />
              </div>
            </div>
          </div>

          {/* Show Logo */}
          <div className="flex items-center gap-3">
            <Switch
              id="invoiceShowLogo"
              checked={showLogo}
              onCheckedChange={setShowLogo}
            />
            <Label htmlFor="invoiceShowLogo" className="cursor-pointer">
              Show organization logo on invoices
            </Label>
          </div>

          {/* Footer Text */}
          <div className="space-y-1.5">
            <Label htmlFor="invoiceFooterText">Invoice Footer Text</Label>
            <Textarea
              id="invoiceFooterText"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="e.g. Payment terms: Net 30. Thank you for your business."
              rows={2}
              maxLength={500}
            />
          </div>
        </div>
      </div>

      {/* Save + Preview */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? "Saving..." : "Save Template Settings"}
        </Button>
        <Button variant="outline" asChild>
          <a href="/api/invoices/preview-pdf" target="_blank">
            Preview PDF
          </a>
        </Button>
      </div>
    </div>
  );
}
```

**Commit:**
```bash
git add src/app/(dashboard)/settings/invoices/page.tsx src/components/settings/InvoiceTemplateSettings.tsx
git commit -m "feat(D2.10): add invoice template settings page with visual picker"
```

---

### Task D2.11 — Add Invoice Templates Link to Settings Hub

**File:** `src/app/(dashboard)/settings/page.tsx`

Add a new entry to the `subPages` array, ideally as the first item (since it's a key feature):

```typescript
{
  href: "/settings/invoices",
  label: "Invoice Templates",
  description: "Choose your PDF layout and customize fonts, colors, and footer.",
  icon: <FileText className="w-4 h-4" />,
  color: "bg-sky-50 text-sky-600",
},
```

Note: `FileText` is already imported from lucide-react. If there is a name collision with the existing "Proposal Templates" entry (which also uses `FileText`), change the invoice one to use a different icon:

```typescript
import { ..., Palette } from "lucide-react";
```

And use `<Palette className="w-4 h-4" />` instead.

**Commit:**
```bash
git add src/app/(dashboard)/settings/page.tsx
git commit -m "feat(D2.11): add Invoice Templates link to settings hub"
```

---

### Task D2.12 — PDF Preview API Route

**New File:** `src/app/api/invoices/preview-pdf/route.ts`

Generates a preview PDF using a sample invoice with the org's current template settings. Used by the "Preview PDF" button in settings.

```typescript
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const orgId = user?.app_metadata?.organizationId as string | undefined;
  if (!orgId) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Find the most recent invoice for this org, or build a sample
  const invoice = await db.invoice.findFirst({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    include: {
      client: true,
      currency: true,
      organization: true,
      lines: {
        include: { taxes: { include: { tax: true } } },
        orderBy: { sort: "asc" },
      },
      payments: { orderBy: { paidAt: "asc" } },
      partialPayments: { orderBy: { sortOrder: "asc" } },
      lateFeeEntries: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!invoice) {
    return new Response(
      "No invoices found. Create an invoice first to preview templates.",
      { status: 404, headers: { "Content-Type": "text/plain" } }
    );
  }

  let generateInvoicePDF: (
    typeof import("@/server/services/invoice-pdf")
  )["generateInvoicePDF"];
  try {
    const mod = await import("@/server/services/invoice-pdf");
    generateInvoicePDF = mod.generateInvoicePDF;
  } catch (err) {
    console.error("[PDF] Failed to load invoice-pdf module:", err);
    return new Response(
      `PDF module load failed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }

  let buffer: Buffer;
  try {
    buffer = await generateInvoicePDF(invoice);
  } catch (err) {
    console.error("[PDF] Preview generation failed:", err);
    return new Response(
      `PDF generation failed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }

  const arrayBuffer =
    buffer.buffer instanceof ArrayBuffer
      ? buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        )
      : buffer.buffer;

  return new Response(arrayBuffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="template-preview.pdf"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
```

**Commit:**
```bash
git add src/app/api/invoices/preview-pdf/route.ts
git commit -m "feat(D2.12): add PDF preview API route for template settings"
```

---

### Task D2.13 — Portal View Adapts Styling to Match Template

**File:** `src/app/portal/[token]/page.tsx`

The portal invoice page should adapt its visual style to hint at the selected template. This is a subtle enhancement.

Add a `data-template` attribute to the outer wrapper so CSS can vary:

```tsx
<PortalShell branding={branding}>
  <div className="space-y-6" data-template={invoice.organization.invoiceTemplate ?? "modern"}>
    {/* ...existing content... */}
  </div>
</PortalShell>
```

Update the `organization` select to also include `invoiceTemplate`:

```typescript
organization: {
  select: {
    // ...existing branding fields...
    invoiceTemplate: true,
  },
},
```

For the Classic template, adjust the invoice card header from rounded to squared:

```tsx
{/* Invoice card — conditional styling based on template */}
<div className={cn(
  "border border-border/50 bg-card overflow-hidden",
  (invoice.organization.invoiceTemplate ?? "modern") === "classic"
    ? "rounded-none border-t-2"
    : "rounded-2xl"
)}>
```

This is optional polish and can be expanded later. The key point is that the org's `invoiceTemplate` field is queried and available for conditional rendering.

**Commit:**
```bash
git add src/app/portal/[token]/page.tsx
git commit -m "feat(D2.13): portal view adapts card styling to selected invoice template"
```

---

## Summary

| Task | Description | Files | Type |
|------|-------------|-------|------|
| D1.1 | Schema: portal branding fields | `prisma/schema.prisma` | Migration |
| D1.2 | tRPC: expose branding in org router | `organization.ts` | Backend |
| D1.3 | Portal branding helper + tests | `portal-branding.ts` | Utility |
| D1.4 | PortalShell component | `PortalShell.tsx` | Component |
| D1.5 | Portal invoice page uses PortalShell | `portal/[token]/page.tsx` | Frontend |
| D1.6 | Portal layout includes branding fields | `portal/[token]/layout.tsx` | Frontend |
| D1.7 | Portal dashboard uses PortalShell | `dashboard/[clientToken]/layout.tsx` | Frontend |
| D1.8 | Portal login page branded | `portal/[token]/login/` | Frontend |
| D1.9 | Email templates dynamic branding | `src/emails/*.tsx` | Email |
| D1.10 | PortalBrandingForm component | `PortalBrandingForm.tsx` | Component |
| D1.11 | Settings page: portal branding section | `settings/page.tsx` | Frontend |
| D2.1 | Schema: invoice template fields | `prisma/schema.prisma` | Migration |
| D2.2 | tRPC: expose template fields | `organization.ts` | Backend |
| D2.3 | Template config helper + tests | `invoice-template-config.ts` | Utility |
| D2.4 | Shared PDF template types | `pdf-templates/types.ts` | Types |
| D2.5 | Modern template (refactored) | `pdf-templates/modern.tsx` | PDF |
| D2.6 | Classic template | `pdf-templates/classic.tsx` | PDF |
| D2.7 | Minimal template | `pdf-templates/minimal.tsx` | PDF |
| D2.8 | Compact template | `pdf-templates/compact.tsx` | PDF |
| D2.9 | Template registry + dispatch | `pdf-templates/index.ts`, `invoice-pdf.tsx` | PDF |
| D2.10 | Invoice template settings page | `settings/invoices/page.tsx` | Frontend |
| D2.11 | Settings hub link | `settings/page.tsx` | Frontend |
| D2.12 | PDF preview API route | `api/invoices/preview-pdf/route.ts` | API |
| D2.13 | Portal adapts to template | `portal/[token]/page.tsx` | Frontend |
