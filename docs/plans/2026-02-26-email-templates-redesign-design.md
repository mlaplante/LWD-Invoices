# Email Templates Redesign — Design Document

**Date:** 2026-02-26
**Status:** Approved

## Overview

Redesign all 6 transactional email templates to a refined, professional aesthetic with consistent branding, improved visual hierarchy, and targeted UX fixes per template.

## Design System

### Layout Anatomy (shared across all templates)

```
┌─────────────────────────────────────────┐
│  [dark navy header #0f1628, 32px pad]   │
│    [logo img OR org name in Georgia]    │
│    [email type label, small, muted]     │
├─ 4px accent strip (semantic color) ─────┤
│                                         │
│  [white body, 40px padding]             │
│    Hi {name},                           │
│    [1-2 sentence body copy]             │
│                                         │
│  ┌ data card [#f8f8f7 bg, 8px radius] ┐ │
│  │ INVOICE #      │  AMOUNT DUE       │ │
│  │ #1042          │  $2,400.00  (32px)│ │
│  │                                    │ │
│  │ DUE DATE                           │ │
│  │ March 15, 2026                     │ │
│  └────────────────────────────────────┘ │
│                                         │
│  [CTA button — centered, 14px 32px pad] │
│                                         │
├─────────────────────────────────────────┤
│  [footer: centered, 12px, #9ca3af]      │
│  Sent by {orgName} · Powered by Pancake │
└─────────────────────────────────────────┘
```

### Typography
- **Header org name / logo fallback:** Georgia, 'Times New Roman', serif — 22px, white
- **Header label:** system sans-serif, 11px, uppercase, letter-spacing 0.15em, `#64748b`
- **Body text:** -apple-system, 'Segoe UI', sans-serif — 15px, `#4b5563`
- **Data labels:** 11px, uppercase, letter-spacing 0.08em, `#9ca3af`
- **Data values:** 16px bold, `#0f1628`
- **Amount:** 32px bold, `#0f1628`, letter-spacing -1px

### Color Palette
- **Page background:** `#f0efe9` (warm off-white)
- **Card background:** `#ffffff`
- **Header:** `#0f1628` (deep navy)
- **Data card:** `#f8f8f7`
- **Body text:** `#4b5563`
- **Muted text:** `#9ca3af`

### Semantic Accent Colors (4px strip + CTA button + data card label accents)
| Template | Label | Hex |
|---|---|---|
| InvoiceSentEmail | NEW INVOICE | `#2563eb` |
| PaymentReminderEmail | PAYMENT REMINDER | `#d97706` |
| PaymentReceiptEmail | PAYMENT CONFIRMED | `#059669` |
| OverdueEmail | PAYMENT OVERDUE | `#e11d48` |
| InvoiceViewedEmail | INVOICE ACTIVITY | `#7c3aed` |
| InvoiceCommentEmail | NEW COMMENT | `#0284c7` |

### Logo Support
All templates gain an optional `logoUrl?: string` prop. When present, an `<Img>` tag renders at max-height 40px in the header. When absent, falls back to org name in Georgia serif.

## Per-Template Changes

### InvoiceSentEmail
- Add `logoUrl?: string` prop
- Header label: "NEW INVOICE"
- Blue (2563eb) accent strip
- Data card: invoice # (left) + amount (right, 32px), due date below
- Button: "View Invoice" — blue
- Copy: "You have a new invoice from {orgName}. Please review and pay at your earliest convenience."

### PaymentReminderEmail
- Add `logoUrl?: string` prop
- Header label: "PAYMENT REMINDER"
- Amber (d97706) accent strip
- Data card: invoice # (left) + amount (right), then due date + "DUE IN X DAYS" below
- Button: "Pay Invoice" — amber
- Copy: "This is a friendly reminder that invoice #{invoiceNumber} is due in {daysUntilDue} days."

### PaymentReceiptEmail
- Add `logoUrl?: string` prop
- Header label: "PAYMENT CONFIRMED ✓"
- Emerald (059669) accent strip
- Data card: invoice # (left) + amount paid in green (right), payment date below
- **Add CTA button:** "View Receipt" — emerald — linking to portal
- Copy: "We've received your payment. Thank you — it's much appreciated!"

### OverdueEmail
- Add `logoUrl?: string` prop
- Header label: "PAYMENT OVERDUE"
- Rose red (e11d48) accent strip
- Data card: invoice # (left) + amount in red (right), "WAS DUE" date + "X DAYS OVERDUE" badge below
- Button: "Pay Now" — rose red
- Copy: "Invoice #{invoiceNumber} is now {daysOverdue} days overdue. Please arrange payment as soon as possible."

### InvoiceViewedEmail
- Add `logoUrl?: string` prop
- **Add props:** `total: string`, `currencySymbol: string` (so owner sees invoice value)
- Header label: "INVOICE ACTIVITY"
- Purple (7c3aed) accent strip
- Data card: invoice # (left) + amount (right, so owner knows the value at a glance), viewed at below
- Button: "View Invoice" — purple
- Recipient: business owner (not client)

### InvoiceCommentEmail
- Add `logoUrl?: string` prop
- Header label: "NEW COMMENT"
- Sky blue (0284c7) accent strip
- Comment body in a proper styled block: `#f0f7ff` background, italic, `#1e3a5f` text, left border
- Button: "View & Reply" — sky blue
- Copy: "{authorName} left a comment on Invoice #{invoiceNumber}:"

## Files to Modify

| File | Changes |
|---|---|
| `src/emails/InvoiceSentEmail.tsx` | Full redesign + logoUrl prop |
| `src/emails/PaymentReminderEmail.tsx` | Full redesign + logoUrl prop |
| `src/emails/PaymentReceiptEmail.tsx` | Full redesign + logoUrl prop + portal button |
| `src/emails/OverdueEmail.tsx` | Full redesign + logoUrl prop |
| `src/emails/InvoiceViewedEmail.tsx` | Full redesign + logoUrl + total + currencySymbol props |
| `src/emails/InvoiceCommentEmail.tsx` | Full redesign + logoUrl prop |

## Callers to Update

After updating template props, any code that instantiates these templates must pass the new `logoUrl` (optional) and, for `InvoiceViewedEmail`, the new `total` and `currencySymbol` props.

Search for usages in:
- `src/server/routers/`
- `src/inngest/`
- `src/app/api/`
- `src/app/portal/`
