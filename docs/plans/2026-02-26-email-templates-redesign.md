# Email Templates Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign all 6 transactional email templates to a refined, professional aesthetic with a dark navy header, semantic color accents, improved typography, and targeted UX fixes per template.

**Architecture:** Each template is a standalone React component in `src/emails/`. All templates share the same layout structure (dark header → 4px accent strip → white body → data card → CTA → footer). Two callers need prop updates alongside template changes: the portal layout for `InvoiceViewedEmail` and the Stripe webhook for `PaymentReceiptEmail`.

**Tech Stack:** `@react-email/components` (Html, Head, Body, Container, Section, Row, Column, Text, Button, Hr, Img, Preview), React, TypeScript. Verification via `npx tsc --noEmit`.

**Design reference:** `docs/plans/2026-02-26-email-templates-redesign-design.md`

---

## Shared Style Reference

All templates use this style system (inline — do not create a shared file):

```ts
// Page + card
const page = { backgroundColor: "#f0efe9", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }
const card = { maxWidth: 580, margin: "32px auto", backgroundColor: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb" }

// Header (dark navy)
const header = { backgroundColor: "#0f1628", padding: "28px 32px", textAlign: "center" as const }
const headerOrgName = { color: "#ffffff", fontSize: 22, fontWeight: "bold", fontFamily: "Georgia, 'Times New Roman', Times, serif", margin: 0, letterSpacing: "-0.5px" }
const headerLabel = { color: "#64748b", fontSize: 11, letterSpacing: "0.15em", margin: "8px 0 0", textTransform: "uppercase" as const }

// Accent strip: a Section with height 4 and the semantic color as backgroundColor

// Body
const body = { padding: "32px 40px" }
const greeting = { fontSize: 16, color: "#0f1628", fontWeight: "600" as const, margin: "0 0 8px" }
const bodyText = { color: "#4b5563", fontSize: 15, lineHeight: "1.6", margin: "0 0 24px" }

// Data card
const dataCard = { backgroundColor: "#f8f8f7", borderRadius: 8, padding: "20px 24px", margin: "0 0 28px" }
const dataLabel = { color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 4px", fontWeight: "500" as const }
const dataValue = { color: "#0f1628", fontSize: 15, fontWeight: "bold" as const, margin: "0 0 16px" }
const dataAmount = { color: "#0f1628", fontSize: 30, fontWeight: "bold" as const, margin: "0 0 16px", letterSpacing: "-1px" }

// Footer
const footer = { padding: "0 40px 28px", textAlign: "center" as const }
const footerText = { fontSize: 12, color: "#9ca3af", margin: "0" }
```

**Accent strip usage** (4px tall colored divider between header and body):
```tsx
<Section style={{ backgroundColor: ACCENT_COLOR, lineHeight: "4px", fontSize: "4px" }}>&nbsp;</Section>
```

**Logo/fallback pattern:**
```tsx
{logoUrl ? (
  <Img src={logoUrl} alt={orgName} height={40} style={{ maxHeight: 40, margin: "0 auto" }} />
) : (
  <Text style={headerOrgName}>{orgName}</Text>
)}
```

---

## Task 1: Redesign InvoiceSentEmail

**Files:**
- Modify: `src/emails/InvoiceSentEmail.tsx`

**Step 1: Replace the entire file**

```tsx
import {
  Html, Head, Body, Container, Section, Row, Column,
  Text, Button, Hr, Img, Preview,
} from "@react-email/components";
import React from "react";

type Props = {
  invoiceNumber: string;
  clientName: string;
  total: string;
  currencySymbol: string;
  dueDate: string | null;
  orgName: string;
  portalLink: string;
  logoUrl?: string;
};

const ACCENT = "#2563eb";

export function InvoiceSentEmail({
  invoiceNumber, clientName, total, currencySymbol, dueDate, orgName, portalLink, logoUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>Invoice #{invoiceNumber} from {orgName} — {currencySymbol}{total}</Preview>
      <Body style={{ backgroundColor: "#f0efe9", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
        <Container style={{ maxWidth: 580, margin: "32px auto", backgroundColor: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb" }}>

          {/* Header */}
          <Section style={{ backgroundColor: "#0f1628", padding: "28px 32px", textAlign: "center" }}>
            {logoUrl ? (
              <Img src={logoUrl} alt={orgName} height={40} style={{ maxHeight: 40, margin: "0 auto" }} />
            ) : (
              <Text style={{ color: "#ffffff", fontSize: 22, fontWeight: "bold", fontFamily: "Georgia, 'Times New Roman', Times, serif", margin: 0, letterSpacing: "-0.5px" }}>
                {orgName}
              </Text>
            )}
            <Text style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.15em", margin: "8px 0 0", textTransform: "uppercase" }}>
              New Invoice
            </Text>
          </Section>

          {/* Accent strip */}
          <Section style={{ backgroundColor: ACCENT, lineHeight: "4px", fontSize: "4px" }}>&nbsp;</Section>

          {/* Body */}
          <Section style={{ padding: "32px 40px" }}>
            <Text style={{ fontSize: 16, color: "#0f1628", fontWeight: "600", margin: "0 0 8px" }}>
              Hi {clientName},
            </Text>
            <Text style={{ color: "#4b5563", fontSize: 15, lineHeight: "1.6", margin: "0 0 24px" }}>
              You have a new invoice from <strong>{orgName}</strong>. Please review and pay at your earliest convenience.
            </Text>

            {/* Data card */}
            <Section style={{ backgroundColor: "#f8f8f7", borderRadius: 8, padding: "20px 24px", margin: "0 0 28px" }}>
              <Row>
                <Column style={{ width: "50%", paddingRight: 12, verticalAlign: "top" }}>
                  <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Invoice</Text>
                  <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: "0 0 16px" }}>#{invoiceNumber}</Text>
                </Column>
                <Column style={{ width: "50%", paddingLeft: 12, verticalAlign: "top" }}>
                  <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Amount Due</Text>
                  <Text style={{ color: "#0f1628", fontSize: 30, fontWeight: "bold", margin: "0 0 16px", letterSpacing: "-1px" }}>{currencySymbol}{total}</Text>
                </Column>
              </Row>
              {dueDate && (
                <>
                  <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Due Date</Text>
                  <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: 0 }}>{dueDate}</Text>
                </>
              )}
            </Section>

            <Button
              href={portalLink}
              style={{ backgroundColor: ACCENT, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
            >
              View Invoice
            </Button>
          </Section>

          {/* Footer */}
          <Hr style={{ borderColor: "#f3f4f6", margin: 0 }} />
          <Section style={{ padding: "20px 40px", textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
              Sent by {orgName} · Powered by Pancake
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}

export default InvoiceSentEmail;
```

**Step 2: Type-check**

```bash
cd /Users/mlaplante/Sites/pancake && npx tsc --noEmit 2>&1 | grep "InvoiceSentEmail"
```
Expected: no errors

**Step 3: Commit**
```bash
git add src/emails/InvoiceSentEmail.tsx
git commit -m "feat(emails): redesign InvoiceSentEmail with dark header and refined layout"
```

---

## Task 2: Redesign PaymentReminderEmail

**Files:**
- Modify: `src/emails/PaymentReminderEmail.tsx`

**Step 1: Replace the entire file**

```tsx
import {
  Html, Head, Body, Container, Section, Row, Column,
  Text, Button, Hr, Img, Preview,
} from "@react-email/components";
import React from "react";

type Props = {
  invoiceNumber: string;
  clientName: string;
  total: string;
  currencySymbol: string;
  dueDate: string;
  daysUntilDue: number;
  orgName: string;
  portalLink: string;
  logoUrl?: string;
};

const ACCENT = "#d97706";

export function PaymentReminderEmail({
  invoiceNumber, clientName, total, currencySymbol, dueDate, daysUntilDue, orgName, portalLink, logoUrl,
}: Props) {
  const dayLabel = daysUntilDue === 1 ? "day" : "days";
  return (
    <Html>
      <Head />
      <Preview>Payment reminder — Invoice #{invoiceNumber} due in {daysUntilDue} {dayLabel}</Preview>
      <Body style={{ backgroundColor: "#f0efe9", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
        <Container style={{ maxWidth: 580, margin: "32px auto", backgroundColor: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb" }}>

          <Section style={{ backgroundColor: "#0f1628", padding: "28px 32px", textAlign: "center" }}>
            {logoUrl ? (
              <Img src={logoUrl} alt={orgName} height={40} style={{ maxHeight: 40, margin: "0 auto" }} />
            ) : (
              <Text style={{ color: "#ffffff", fontSize: 22, fontWeight: "bold", fontFamily: "Georgia, 'Times New Roman', Times, serif", margin: 0, letterSpacing: "-0.5px" }}>
                {orgName}
              </Text>
            )}
            <Text style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.15em", margin: "8px 0 0", textTransform: "uppercase" }}>
              Payment Reminder
            </Text>
          </Section>

          <Section style={{ backgroundColor: ACCENT, lineHeight: "4px", fontSize: "4px" }}>&nbsp;</Section>

          <Section style={{ padding: "32px 40px" }}>
            <Text style={{ fontSize: 16, color: "#0f1628", fontWeight: "600", margin: "0 0 8px" }}>
              Hi {clientName},
            </Text>
            <Text style={{ color: "#4b5563", fontSize: 15, lineHeight: "1.6", margin: "0 0 24px" }}>
              This is a friendly reminder that invoice <strong>#{invoiceNumber}</strong> is due in <strong>{daysUntilDue} {dayLabel}</strong>.
            </Text>

            <Section style={{ backgroundColor: "#f8f8f7", borderRadius: 8, padding: "20px 24px", margin: "0 0 28px" }}>
              <Row>
                <Column style={{ width: "50%", paddingRight: 12, verticalAlign: "top" }}>
                  <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Invoice</Text>
                  <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: "0 0 16px" }}>#{invoiceNumber}</Text>
                </Column>
                <Column style={{ width: "50%", paddingLeft: 12, verticalAlign: "top" }}>
                  <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Amount Due</Text>
                  <Text style={{ color: "#0f1628", fontSize: 30, fontWeight: "bold", margin: "0 0 16px", letterSpacing: "-1px" }}>{currencySymbol}{total}</Text>
                </Column>
              </Row>
              <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Due Date</Text>
              <Row>
                <Column style={{ verticalAlign: "middle" }}>
                  <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: 0 }}>{dueDate}</Text>
                </Column>
                <Column style={{ textAlign: "right", verticalAlign: "middle" }}>
                  <Text style={{ color: "#ffffff", backgroundColor: ACCENT, fontSize: 12, fontWeight: "bold", padding: "3px 10px", borderRadius: 20, margin: 0, display: "inline-block" }}>
                    Due in {daysUntilDue} {dayLabel}
                  </Text>
                </Column>
              </Row>
            </Section>

            <Button
              href={portalLink}
              style={{ backgroundColor: ACCENT, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
            >
              Pay Invoice
            </Button>
          </Section>

          <Hr style={{ borderColor: "#f3f4f6", margin: 0 }} />
          <Section style={{ padding: "20px 40px", textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
              Sent by {orgName} · Powered by Pancake
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}

export default PaymentReminderEmail;
```

**Step 2: Type-check**
```bash
cd /Users/mlaplante/Sites/pancake && npx tsc --noEmit 2>&1 | grep "PaymentReminderEmail"
```
Expected: no errors

**Step 3: Commit**
```bash
git add src/emails/PaymentReminderEmail.tsx
git commit -m "feat(emails): redesign PaymentReminderEmail with amber accent and due-in badge"
```

---

## Task 3: Redesign PaymentReceiptEmail

**Files:**
- Modify: `src/emails/PaymentReceiptEmail.tsx`
- Modify: `src/app/api/webhooks/stripe/route.ts` (add `portalLink` prop to caller)

**Step 1: Replace PaymentReceiptEmail**

```tsx
import {
  Html, Head, Body, Container, Section, Row, Column,
  Text, Button, Hr, Img, Preview,
} from "@react-email/components";
import React from "react";

type Props = {
  invoiceNumber: string;
  clientName: string;
  amountPaid: string;
  currencySymbol: string;
  paidAt: string;
  orgName: string;
  portalLink?: string;
  logoUrl?: string;
};

const ACCENT = "#059669";

export function PaymentReceiptEmail({
  invoiceNumber, clientName, amountPaid, currencySymbol, paidAt, orgName, portalLink, logoUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>Payment confirmed — Invoice #{invoiceNumber} · {currencySymbol}{amountPaid}</Preview>
      <Body style={{ backgroundColor: "#f0efe9", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
        <Container style={{ maxWidth: 580, margin: "32px auto", backgroundColor: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb" }}>

          <Section style={{ backgroundColor: "#0f1628", padding: "28px 32px", textAlign: "center" }}>
            {logoUrl ? (
              <Img src={logoUrl} alt={orgName} height={40} style={{ maxHeight: 40, margin: "0 auto" }} />
            ) : (
              <Text style={{ color: "#ffffff", fontSize: 22, fontWeight: "bold", fontFamily: "Georgia, 'Times New Roman', Times, serif", margin: 0, letterSpacing: "-0.5px" }}>
                {orgName}
              </Text>
            )}
            <Text style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.15em", margin: "8px 0 0", textTransform: "uppercase" }}>
              Payment Confirmed ✓
            </Text>
          </Section>

          <Section style={{ backgroundColor: ACCENT, lineHeight: "4px", fontSize: "4px" }}>&nbsp;</Section>

          <Section style={{ padding: "32px 40px" }}>
            <Text style={{ fontSize: 16, color: "#0f1628", fontWeight: "600", margin: "0 0 8px" }}>
              Hi {clientName},
            </Text>
            <Text style={{ color: "#4b5563", fontSize: 15, lineHeight: "1.6", margin: "0 0 24px" }}>
              We&apos;ve received your payment for invoice <strong>#{invoiceNumber}</strong>. Thank you — it&apos;s much appreciated!
            </Text>

            <Section style={{ backgroundColor: "#f8f8f7", borderRadius: 8, padding: "20px 24px", margin: "0 0 28px" }}>
              <Row>
                <Column style={{ width: "50%", paddingRight: 12, verticalAlign: "top" }}>
                  <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Invoice</Text>
                  <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: "0 0 16px" }}>#{invoiceNumber}</Text>
                </Column>
                <Column style={{ width: "50%", paddingLeft: 12, verticalAlign: "top" }}>
                  <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Amount Paid</Text>
                  <Text style={{ color: ACCENT, fontSize: 30, fontWeight: "bold", margin: "0 0 16px", letterSpacing: "-1px" }}>{currencySymbol}{amountPaid}</Text>
                </Column>
              </Row>
              <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Payment Date</Text>
              <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: 0 }}>{paidAt}</Text>
            </Section>

            {portalLink && (
              <Button
                href={portalLink}
                style={{ backgroundColor: ACCENT, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
              >
                View Receipt
              </Button>
            )}
          </Section>

          <Hr style={{ borderColor: "#f3f4f6", margin: 0 }} />
          <Section style={{ padding: "20px 40px", textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
              Sent by {orgName} · Powered by Pancake
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}

export default PaymentReceiptEmail;
```

**Step 2: Update Stripe webhook caller**

In `src/app/api/webhooks/stripe/route.ts`, find the `PaymentReceiptEmail({` call and add `portalLink`:

```ts
// Add portalLink to the PaymentReceiptEmail call (after the existing paidAt line):
portalLink: fullInvoice.portalToken
  ? `${process.env.NEXT_PUBLIC_APP_URL}/portal/${fullInvoice.portalToken}`
  : undefined,
```

**Step 3: Type-check**
```bash
cd /Users/mlaplante/Sites/pancake && npx tsc --noEmit 2>&1 | grep -E "PaymentReceipt|stripe"
```
Expected: no errors

**Step 4: Commit**
```bash
git add src/emails/PaymentReceiptEmail.tsx src/app/api/webhooks/stripe/route.ts
git commit -m "feat(emails): redesign PaymentReceiptEmail, add portal link CTA"
```

---

## Task 4: Redesign OverdueEmail

**Files:**
- Modify: `src/emails/OverdueEmail.tsx`

**Step 1: Replace the entire file**

```tsx
import {
  Html, Head, Body, Container, Section, Row, Column,
  Text, Button, Hr, Img, Preview,
} from "@react-email/components";
import React from "react";

type Props = {
  invoiceNumber: string;
  clientName: string;
  total: string;
  currencySymbol: string;
  dueDate: string;
  daysOverdue: number;
  orgName: string;
  portalLink: string;
  logoUrl?: string;
};

const ACCENT = "#e11d48";

export function OverdueEmail({
  invoiceNumber, clientName, total, currencySymbol, dueDate, daysOverdue, orgName, portalLink, logoUrl,
}: Props) {
  const dayLabel = daysOverdue === 1 ? "day" : "days";
  return (
    <Html>
      <Head />
      <Preview>OVERDUE — Invoice #{invoiceNumber} was due {daysOverdue} {dayLabel} ago</Preview>
      <Body style={{ backgroundColor: "#f0efe9", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
        <Container style={{ maxWidth: 580, margin: "32px auto", backgroundColor: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb" }}>

          <Section style={{ backgroundColor: "#0f1628", padding: "28px 32px", textAlign: "center" }}>
            {logoUrl ? (
              <Img src={logoUrl} alt={orgName} height={40} style={{ maxHeight: 40, margin: "0 auto" }} />
            ) : (
              <Text style={{ color: "#ffffff", fontSize: 22, fontWeight: "bold", fontFamily: "Georgia, 'Times New Roman', Times, serif", margin: 0, letterSpacing: "-0.5px" }}>
                {orgName}
              </Text>
            )}
            <Text style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.15em", margin: "8px 0 0", textTransform: "uppercase" }}>
              Payment Overdue
            </Text>
          </Section>

          <Section style={{ backgroundColor: ACCENT, lineHeight: "4px", fontSize: "4px" }}>&nbsp;</Section>

          <Section style={{ padding: "32px 40px" }}>
            <Text style={{ fontSize: 16, color: "#0f1628", fontWeight: "600", margin: "0 0 8px" }}>
              Hi {clientName},
            </Text>
            <Text style={{ color: "#4b5563", fontSize: 15, lineHeight: "1.6", margin: "0 0 24px" }}>
              Invoice <strong>#{invoiceNumber}</strong> is now <strong style={{ color: ACCENT }}>{daysOverdue} {dayLabel} overdue</strong>. Please arrange payment as soon as possible.
            </Text>

            <Section style={{ backgroundColor: "#f8f8f7", borderRadius: 8, padding: "20px 24px", margin: "0 0 28px" }}>
              <Row>
                <Column style={{ width: "50%", paddingRight: 12, verticalAlign: "top" }}>
                  <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Invoice</Text>
                  <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: "0 0 16px" }}>#{invoiceNumber}</Text>
                </Column>
                <Column style={{ width: "50%", paddingLeft: 12, verticalAlign: "top" }}>
                  <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Amount Overdue</Text>
                  <Text style={{ color: ACCENT, fontSize: 30, fontWeight: "bold", margin: "0 0 16px", letterSpacing: "-1px" }}>{currencySymbol}{total}</Text>
                </Column>
              </Row>
              <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Was Due</Text>
              <Row>
                <Column style={{ verticalAlign: "middle" }}>
                  <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: 0 }}>{dueDate}</Text>
                </Column>
                <Column style={{ textAlign: "right", verticalAlign: "middle" }}>
                  <Text style={{ color: "#ffffff", backgroundColor: ACCENT, fontSize: 12, fontWeight: "bold", padding: "3px 10px", borderRadius: 20, margin: 0, display: "inline-block" }}>
                    {daysOverdue} {dayLabel} overdue
                  </Text>
                </Column>
              </Row>
            </Section>

            <Button
              href={portalLink}
              style={{ backgroundColor: ACCENT, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
            >
              Pay Now
            </Button>
          </Section>

          <Hr style={{ borderColor: "#f3f4f6", margin: 0 }} />
          <Section style={{ padding: "20px 40px", textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
              Sent by {orgName} · Powered by Pancake
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}

export default OverdueEmail;
```

**Step 2: Type-check**
```bash
cd /Users/mlaplante/Sites/pancake && npx tsc --noEmit 2>&1 | grep "OverdueEmail"
```
Expected: no errors

**Step 3: Commit**
```bash
git add src/emails/OverdueEmail.tsx
git commit -m "feat(emails): redesign OverdueEmail with rose red accent and overdue badge"
```

---

## Task 5: Redesign InvoiceViewedEmail + update caller

**Files:**
- Modify: `src/emails/InvoiceViewedEmail.tsx`
- Modify: `src/app/portal/[token]/layout.tsx` (add total/currency to query + props)

**Step 1: Replace InvoiceViewedEmail**

```tsx
import {
  Html, Head, Body, Container, Section, Row, Column,
  Text, Button, Hr, Img, Preview,
} from "@react-email/components";
import React from "react";

type Props = {
  invoiceNumber: string;
  clientName: string;
  orgName: string;
  invoiceLink: string;
  viewedAt: string;
  total?: string;
  currencySymbol?: string;
  logoUrl?: string;
};

const ACCENT = "#7c3aed";

export function InvoiceViewedEmail({
  invoiceNumber, clientName, orgName, invoiceLink, viewedAt, total, currencySymbol, logoUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{clientName} viewed Invoice #{invoiceNumber}{total ? ` · ${currencySymbol}${total}` : ""}</Preview>
      <Body style={{ backgroundColor: "#f0efe9", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
        <Container style={{ maxWidth: 580, margin: "32px auto", backgroundColor: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb" }}>

          <Section style={{ backgroundColor: "#0f1628", padding: "28px 32px", textAlign: "center" }}>
            {logoUrl ? (
              <Img src={logoUrl} alt={orgName} height={40} style={{ maxHeight: 40, margin: "0 auto" }} />
            ) : (
              <Text style={{ color: "#ffffff", fontSize: 22, fontWeight: "bold", fontFamily: "Georgia, 'Times New Roman', Times, serif", margin: 0, letterSpacing: "-0.5px" }}>
                {orgName}
              </Text>
            )}
            <Text style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.15em", margin: "8px 0 0", textTransform: "uppercase" }}>
              Invoice Activity
            </Text>
          </Section>

          <Section style={{ backgroundColor: ACCENT, lineHeight: "4px", fontSize: "4px" }}>&nbsp;</Section>

          <Section style={{ padding: "32px 40px" }}>
            <Text style={{ fontSize: 16, color: "#0f1628", fontWeight: "600", margin: "0 0 8px" }}>
              Invoice viewed
            </Text>
            <Text style={{ color: "#4b5563", fontSize: 15, lineHeight: "1.6", margin: "0 0 24px" }}>
              <strong>{clientName}</strong> opened Invoice <strong>#{invoiceNumber}</strong> on {viewedAt}.
            </Text>

            <Section style={{ backgroundColor: "#f8f8f7", borderRadius: 8, padding: "20px 24px", margin: "0 0 28px" }}>
              {total && currencySymbol ? (
                <Row>
                  <Column style={{ width: "50%", paddingRight: 12, verticalAlign: "top" }}>
                    <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Invoice</Text>
                    <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: "0 0 16px" }}>#{invoiceNumber}</Text>
                  </Column>
                  <Column style={{ width: "50%", paddingLeft: 12, verticalAlign: "top" }}>
                    <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Invoice Value</Text>
                    <Text style={{ color: "#0f1628", fontSize: 30, fontWeight: "bold", margin: "0 0 16px", letterSpacing: "-1px" }}>{currencySymbol}{total}</Text>
                  </Column>
                </Row>
              ) : (
                <>
                  <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Invoice</Text>
                  <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: "0 0 16px" }}>#{invoiceNumber}</Text>
                </>
              )}
              <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Viewed At</Text>
              <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: 0 }}>{viewedAt}</Text>
            </Section>

            <Button
              href={invoiceLink}
              style={{ backgroundColor: ACCENT, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
            >
              View Invoice
            </Button>
          </Section>

          <Hr style={{ borderColor: "#f3f4f6", margin: 0 }} />
          <Section style={{ padding: "20px 40px", textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
              {orgName} · Powered by Pancake
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}

export default InvoiceViewedEmail;
```

**Step 2: Update portal layout query**

In `src/app/portal/[token]/layout.tsx`, add `total` and `currency` to the Prisma select:

```ts
// In the invoice select, add these two fields alongside existing ones:
total: true,
currency: {
  select: { symbol: true },
},
```

**Step 3: Update InvoiceViewedEmail call in portal layout**

In the `InvoiceViewedEmail({...})` call, add:
```ts
total: Number(invoice.total).toFixed(2),
currencySymbol: invoice.currency.symbol,
```

**Step 4: Type-check**
```bash
cd /Users/mlaplante/Sites/pancake && npx tsc --noEmit 2>&1 | grep -E "InvoiceViewed|portal"
```
Expected: no errors

**Step 5: Commit**
```bash
git add src/emails/InvoiceViewedEmail.tsx src/app/portal/[token]/layout.tsx
git commit -m "feat(emails): redesign InvoiceViewedEmail, add invoice value to notification"
```

---

## Task 6: Redesign InvoiceCommentEmail

**Files:**
- Modify: `src/emails/InvoiceCommentEmail.tsx`

**Step 1: Replace the entire file**

```tsx
import {
  Html, Head, Body, Container, Section,
  Text, Button, Hr, Img, Preview,
} from "@react-email/components";
import React from "react";

type Props = {
  invoiceNumber: string;
  clientName: string;
  authorName: string;
  commentBody: string;
  orgName: string;
  invoiceLink: string;
  logoUrl?: string;
};

const ACCENT = "#0284c7";

export function InvoiceCommentEmail({
  invoiceNumber, clientName, authorName, commentBody, orgName, invoiceLink, logoUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{authorName} commented on Invoice #{invoiceNumber}</Preview>
      <Body style={{ backgroundColor: "#f0efe9", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
        <Container style={{ maxWidth: 580, margin: "32px auto", backgroundColor: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb" }}>

          <Section style={{ backgroundColor: "#0f1628", padding: "28px 32px", textAlign: "center" }}>
            {logoUrl ? (
              <Img src={logoUrl} alt={orgName} height={40} style={{ maxHeight: 40, margin: "0 auto" }} />
            ) : (
              <Text style={{ color: "#ffffff", fontSize: 22, fontWeight: "bold", fontFamily: "Georgia, 'Times New Roman', Times, serif", margin: 0, letterSpacing: "-0.5px" }}>
                {orgName}
              </Text>
            )}
            <Text style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.15em", margin: "8px 0 0", textTransform: "uppercase" }}>
              New Comment
            </Text>
          </Section>

          <Section style={{ backgroundColor: ACCENT, lineHeight: "4px", fontSize: "4px" }}>&nbsp;</Section>

          <Section style={{ padding: "32px 40px" }}>
            <Text style={{ fontSize: 16, color: "#0f1628", fontWeight: "600", margin: "0 0 8px" }}>
              Comment on Invoice #{invoiceNumber}
            </Text>
            <Text style={{ color: "#4b5563", fontSize: 15, lineHeight: "1.6", margin: "0 0 20px" }}>
              <strong>{authorName}</strong> ({clientName}) left a comment:
            </Text>

            {/* Comment block */}
            <Section style={{ backgroundColor: "#f0f7ff", borderLeft: "3px solid " + ACCENT, borderRadius: "0 6px 6px 0", padding: "16px 20px", margin: "0 0 28px" }}>
              <Text style={{ color: "#1e3a5f", fontSize: 15, lineHeight: "1.7", fontStyle: "italic", margin: 0, whiteSpace: "pre-wrap" }}>
                {commentBody}
              </Text>
            </Section>

            <Button
              href={invoiceLink}
              style={{ backgroundColor: ACCENT, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
            >
              View &amp; Reply
            </Button>
          </Section>

          <Hr style={{ borderColor: "#f3f4f6", margin: 0 }} />
          <Section style={{ padding: "20px 40px", textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
              {orgName} · Powered by Pancake
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}

export default InvoiceCommentEmail;
```

**Step 2: Type-check**
```bash
cd /Users/mlaplante/Sites/pancake && npx tsc --noEmit 2>&1 | grep "InvoiceComment"
```
Expected: no errors

**Step 3: Commit**
```bash
git add src/emails/InvoiceCommentEmail.tsx
git commit -m "feat(emails): redesign InvoiceCommentEmail with styled comment block"
```

---

## Task 7: Final verification

**Step 1: Full type-check**
```bash
cd /Users/mlaplante/Sites/pancake && npx tsc --noEmit
```
Expected: exit 0, no errors

**Step 2: Build check**
```bash
cd /Users/mlaplante/Sites/pancake && npm run build 2>&1 | tail -20
```
Expected: successful build

**Step 3: Final commit if any stragglers**
```bash
git status
# If clean, nothing to do. If there are unstaged changes, stage and commit them.
```
