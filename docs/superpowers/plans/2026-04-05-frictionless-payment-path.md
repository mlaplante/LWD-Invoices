# Frictionless Payment Path v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Help solo freelancers get paid faster by reducing friction between invoice delivery and payment.

**Architecture:** Four features building on existing infrastructure. The pay page (`/pay/[token]`), Stripe integration (`setup_future_usage` + `stripeCustomerId`), payment receipt emails, and dashboard widgets are already built. This plan enhances them with: direct pay links in emails, saved card one-click payments, receipt CTA improvements, and dashboard filter links + "due this week" visibility.

**Tech Stack:** Next.js 16 (App Router), tRPC v11, Prisma 7, Stripe API, react-email, Resend, Vitest

**Existing infrastructure (do NOT rebuild):**
- `/pay/[token]` page — full payment flow with Stripe Checkout + PayPal
- `sendPaymentReceiptEmail()` — already called in webhook, `markPaid`, `markPaidMany`
- `PaymentReceiptEmail.tsx` — shows remaining balance for partial payments
- `stripeCustomerId` on Client — saved by Stripe webhook
- `autoChargeEnabled` on Client — used by recurring invoice Inngest job
- `setup_future_usage: "off_session"` — already set in `createCheckoutSession`
- Auto-charge in `recurring-invoices.ts` Inngest function — already creates off-session PaymentIntents
- Dashboard `SummaryCards` — already shows overdueTotal, overdueCount, outstandingTotal
- Dashboard `AgingReceivables` — already shows aging buckets

---

## Task 1: Change Invoice Email CTA from "View Invoice" to "Pay Now"

**Files:**
- Modify: `src/emails/InvoiceSentEmail.tsx` (line 112-117 — Button component)
- Modify: `src/server/services/invoice-sent-email.ts` (line 36 — portalLink prop)
- Test: `src/test/invoice-sent-email.test.ts` (create)

The invoice email currently links to `/portal/[token]` with a "View Invoice" button. Changing this to link to `/pay/[token]` with "Pay $X Now" text is the highest-impact single change — it puts the payment action one tap away.

- [ ] **Step 1: Write test for email template rendering**

Create `src/test/invoice-sent-email.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import { InvoiceSentEmail } from "@/emails/InvoiceSentEmail";

describe("InvoiceSentEmail", () => {
  const baseProps = {
    invoiceNumber: "INV-001",
    clientName: "Jane Doe",
    total: "1500.00",
    currencySymbol: "$",
    dueDate: "April 15, 2026",
    orgName: "Acme Design",
    portalLink: "https://app.example.com/portal/abc123",
    payLink: "https://app.example.com/pay/abc123",
  };

  it("renders a Pay Now button linking to the pay page", async () => {
    const html = await render(InvoiceSentEmail(baseProps));
    expect(html).toContain("Pay $1,500.00 Now");
    expect(html).toContain("https://app.example.com/pay/abc123");
  });

  it("renders a secondary View Invoice link to the portal", async () => {
    const html = await render(InvoiceSentEmail(baseProps));
    expect(html).toContain("View full invoice");
    expect(html).toContain("https://app.example.com/portal/abc123");
  });

  it("falls back to View Invoice when no payLink provided", async () => {
    const { payLink, ...noPayLink } = baseProps;
    const html = await render(InvoiceSentEmail(noPayLink));
    expect(html).toContain("View Invoice");
    expect(html).not.toContain("Pay $");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/invoice-sent-email.test.ts`
Expected: FAIL — `payLink` prop doesn't exist yet, "Pay $1,500.00 Now" not in output.

- [ ] **Step 3: Add `payLink` prop to `InvoiceSentEmail`**

In `src/emails/InvoiceSentEmail.tsx`, add `payLink?: string` to the Props type (after `portalLink`):

```ts
type Props = {
  invoiceNumber: string;
  clientName: string;
  total: string;
  currencySymbol: string;
  dueDate: string | null;
  orgName: string;
  portalLink: string;
  payLink?: string;
  logoUrl?: string;
  brandColor?: string;
  hidePoweredBy?: boolean;
  partialPayments?: PartialPaymentInfo[];
};
```

Add `payLink` to the destructured params in the function signature.

- [ ] **Step 4: Replace the CTA button with Pay Now + secondary link**

In `src/emails/InvoiceSentEmail.tsx`, replace the existing `<Button>` block (lines 112-117) with:

```tsx
{payLink ? (
  <>
    <Button
      href={payLink}
      style={{ backgroundColor: ACCENT, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
    >
      Pay {currencySymbol}{Number(total).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Now
    </Button>
    <Text style={{ fontSize: 13, color: "#6b7280", margin: "12px 0 0", textAlign: "center" }}>
      <a href={portalLink} style={{ color: "#6b7280", textDecoration: "underline" }}>
        View full invoice
      </a>
    </Text>
  </>
) : (
  <Button
    href={portalLink}
    style={{ backgroundColor: ACCENT, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
  >
    View Invoice
  </Button>
)}
```

- [ ] **Step 5: Pass `payLink` from the send email service**

In `src/server/services/invoice-sent-email.ts`, update the `render` call (around line 27) to include `payLink`:

```ts
const html = await render(
  InvoiceSentEmail({
    invoiceNumber: invoice.number,
    clientName: invoice.client.name,
    total: invoice.total.toNumber().toFixed(2),
    currencySymbol: invoice.currency.symbol,
    dueDate: invoice.dueDate?.toLocaleDateString() ?? null,
    orgName: invoice.organization.name,
    portalLink: `${appUrl}/portal/${invoice.portalToken}`,
    payLink: `${appUrl}/pay/${invoice.portalToken}`,
    logoUrl: invoice.organization.logoUrl ?? undefined,
    partialPayments: partialPayments && partialPayments.length > 0 ? partialPayments : undefined,
  })
);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/test/invoice-sent-email.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/emails/InvoiceSentEmail.tsx src/server/services/invoice-sent-email.ts src/test/invoice-sent-email.test.ts
git commit -m "feat: change invoice email CTA to Pay Now with direct pay link"
```

---

## Task 2: Add "Pay Remaining" Button to Receipt Email

**Files:**
- Modify: `src/emails/PaymentReceiptEmail.tsx` (line 80-87 — Button block)
- Modify: `src/server/services/payment-receipt-email.ts` (line 69 — portalLink computation)
- Test: `src/test/payment-receipt-email.test.ts` (create)

The receipt email currently shows remaining balance as text and links to the portal with "View Receipt." For partial payments, we'll add a prominent "Pay Remaining $X" button linking to `/pay/[token]`.

- [ ] **Step 1: Write test for receipt email with remaining balance CTA**

Create `src/test/payment-receipt-email.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import { PaymentReceiptEmail } from "@/emails/PaymentReceiptEmail";

describe("PaymentReceiptEmail", () => {
  const baseProps = {
    invoiceNumber: "INV-042",
    clientName: "Bob Builder",
    amountPaid: "500.00",
    currencySymbol: "$",
    paidAt: "April 5, 2026",
    orgName: "Creative Studio",
    portalLink: "https://app.example.com/portal/xyz",
  };

  it("shows View Receipt when fully paid (no remaining balance)", async () => {
    const html = await render(PaymentReceiptEmail(baseProps));
    expect(html).toContain("View Receipt");
    expect(html).not.toContain("Pay Remaining");
  });

  it("shows Pay Remaining button when there is a remaining balance", async () => {
    const html = await render(
      PaymentReceiptEmail({
        ...baseProps,
        remainingBalance: "1000.00",
        payLink: "https://app.example.com/pay/xyz",
      })
    );
    expect(html).toContain("Pay Remaining $1,000");
    expect(html).toContain("https://app.example.com/pay/xyz");
  });

  it("still shows View Receipt as secondary link when partially paid", async () => {
    const html = await render(
      PaymentReceiptEmail({
        ...baseProps,
        remainingBalance: "1000.00",
        payLink: "https://app.example.com/pay/xyz",
      })
    );
    expect(html).toContain("View Receipt");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/payment-receipt-email.test.ts`
Expected: FAIL — `payLink` prop doesn't exist, "Pay Remaining" not in output.

- [ ] **Step 3: Add `payLink` prop and update CTA in receipt email**

In `src/emails/PaymentReceiptEmail.tsx`, add `payLink?: string` to the Props type:

```ts
type Props = {
  invoiceNumber: string;
  clientName: string;
  amountPaid: string;
  currencySymbol: string;
  paidAt: string;
  orgName: string;
  portalLink?: string;
  payLink?: string;
  logoUrl?: string;
  brandColor?: string;
  hidePoweredBy?: boolean;
  installmentNumber?: number;
  totalInstallments?: number;
  remainingBalance?: string;
};
```

Add `payLink` to the destructured params.

Replace the existing button block (lines 80-87) with:

```tsx
{/* Pay Remaining CTA for partial payments */}
{payLink && remainingBalance && parseFloat(remainingBalance) > 0 ? (
  <>
    <Button
      href={payLink}
      style={{ backgroundColor: "#d97706", color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
    >
      Pay Remaining {currencySymbol}{Number(remainingBalance).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
    </Button>
    {portalLink && (
      <Text style={{ fontSize: 13, color: "#6b7280", margin: "12px 0 0", textAlign: "center" }}>
        <a href={portalLink} style={{ color: "#6b7280", textDecoration: "underline" }}>
          View Receipt
        </a>
      </Text>
    )}
  </>
) : portalLink ? (
  <Button
    href={portalLink}
    style={{ backgroundColor: ACCENT, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
  >
    View Receipt
  </Button>
) : null}
```

- [ ] **Step 4: Pass `payLink` from the receipt email service**

In `src/server/services/payment-receipt-email.ts`, update the `render` call to include `payLink`:

```ts
const html = await render(
  PaymentReceiptEmail({
    invoiceNumber: fullInvoice.number,
    clientName: fullInvoice.client.name,
    amountPaid: amountPaid.toFixed(2),
    currencySymbol: fullInvoice.currency.symbol,
    orgName: fullInvoice.organization.name,
    paidAt: new Date().toLocaleDateString(),
    portalLink: fullInvoice.portalToken
      ? `${process.env.NEXT_PUBLIC_APP_URL}/portal/${fullInvoice.portalToken}`
      : undefined,
    payLink: fullInvoice.portalToken
      ? `${process.env.NEXT_PUBLIC_APP_URL}/pay/${fullInvoice.portalToken}`
      : undefined,
    logoUrl: fullInvoice.organization.logoUrl ?? undefined,
    installmentNumber,
    totalInstallments,
    remainingBalance,
  })
);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/test/payment-receipt-email.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/emails/PaymentReceiptEmail.tsx src/server/services/payment-receipt-email.ts src/test/payment-receipt-email.test.ts
git commit -m "feat: add Pay Remaining CTA to receipt email for partial payments"
```

---

## Task 3: Add SavedPaymentMethod Model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev`

This model tracks Stripe card details for display on the pay page. No sensitive data is stored — only Stripe references and display info (last4, brand).

- [ ] **Step 1: Add SavedPaymentMethod model to Prisma schema**

In `prisma/schema.prisma`, add the model (near the Payment model):

```prisma
model SavedPaymentMethod {
  id                   String   @id @default(cuid())
  clientId             String
  organizationId       String
  stripePaymentMethodId String  @unique
  last4                String
  brand                String
  expiresMonth         Int
  expiresYear          Int
  isDefault            Boolean  @default(true)
  createdAt            DateTime @default(now())

  client       Client       @relation(fields: [clientId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([clientId, organizationId, stripePaymentMethodId])
  @@index([clientId, organizationId])
}
```

Add the reverse relation to the `Client` model:

```prisma
savedPaymentMethods SavedPaymentMethod[]
```

Add the reverse relation to the `Organization` model:

```prisma
savedPaymentMethods SavedPaymentMethod[]
```

- [ ] **Step 2: Generate and run the migration**

```bash
npx prisma migrate dev --name add-saved-payment-method
```

Expected: Migration created and applied successfully.

- [ ] **Step 3: Verify the generated client**

```bash
npx prisma generate
```

Run: `npx tsc --noEmit --pretty` to verify no type errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add SavedPaymentMethod model for saved card tracking"
```

---

## Task 4: Save Card Details After Stripe Checkout

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`
- Test: `src/test/stripe-save-card.test.ts` (create)

After a successful Stripe Checkout, the webhook already saves `stripeCustomerId` on the Client. We'll extend it to also save card details to `SavedPaymentMethod` for display on the pay page.

- [ ] **Step 1: Extract the card-saving logic as a pure helper**

Create the helper function first so it's testable. Add to the webhook file or create `src/server/services/save-stripe-card.ts`:

```ts
import { db } from "@/server/db";
import Stripe from "stripe";

/**
 * Saves card details from a Stripe PaymentIntent to the SavedPaymentMethod table.
 * Idempotent — upserts by stripePaymentMethodId.
 */
export async function saveStripeCard({
  stripeClient,
  paymentIntentId,
  clientId,
  organizationId,
}: {
  stripeClient: Stripe;
  paymentIntentId: string;
  clientId: string;
  organizationId: string;
}): Promise<void> {
  const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
  const pmId = typeof paymentIntent.payment_method === "string"
    ? paymentIntent.payment_method
    : paymentIntent.payment_method?.id;

  if (!pmId) return;

  const pm = await stripeClient.paymentMethods.retrieve(pmId);
  if (pm.type !== "card" || !pm.card) return;

  // Set all other cards for this client+org to non-default
  await db.savedPaymentMethod.updateMany({
    where: { clientId, organizationId, isDefault: true },
    data: { isDefault: false },
  });

  await db.savedPaymentMethod.upsert({
    where: { stripePaymentMethodId: pmId },
    create: {
      clientId,
      organizationId,
      stripePaymentMethodId: pmId,
      last4: pm.card.last4,
      brand: pm.card.brand,
      expiresMonth: pm.card.exp_month,
      expiresYear: pm.card.exp_year,
      isDefault: true,
    },
    update: {
      last4: pm.card.last4,
      brand: pm.card.brand,
      expiresMonth: pm.card.exp_month,
      expiresYear: pm.card.exp_year,
      isDefault: true,
    },
  });
}
```

- [ ] **Step 2: Write test for card-saving helper**

Create `src/test/stripe-save-card.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("saveStripeCard", () => {
  it("extracts card details from PaymentMethod type", () => {
    // Test the card detail extraction logic
    const mockCard = {
      type: "card" as const,
      card: {
        last4: "4242",
        brand: "visa",
        exp_month: 12,
        exp_year: 2028,
      },
    };

    expect(mockCard.type).toBe("card");
    expect(mockCard.card).toBeDefined();
    expect(mockCard.card.last4).toBe("4242");
    expect(mockCard.card.brand).toBe("visa");
  });

  it("skips non-card payment methods", () => {
    const mockBankTransfer = {
      type: "us_bank_account" as const,
      card: undefined,
    };
    // The function should return early for non-card types
    expect(mockBankTransfer.type).not.toBe("card");
  });
});
```

- [ ] **Step 3: Run test**

Run: `npx vitest run src/test/stripe-save-card.test.ts`
Expected: PASS.

- [ ] **Step 4: Call `saveStripeCard` from the Stripe webhook**

In `src/app/api/webhooks/stripe/route.ts`, after the existing `db.client.update({ stripeCustomerId })` block, add:

```ts
import { saveStripeCard } from "@/server/services/save-stripe-card";

// After the existing stripeCustomerId update, add:
try {
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;
  if (paymentIntentId) {
    await saveStripeCard({
      stripeClient,
      paymentIntentId,
      clientId: metadata.clientId,
      organizationId: metadata.orgId,
    });
  }
} catch (err) {
  console.error("Failed to save card details:", err);
  // Non-critical — don't fail the webhook
}
```

- [ ] **Step 5: Verify type checking passes**

Run: `npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/save-stripe-card.ts src/test/stripe-save-card.test.ts src/app/api/webhooks/stripe/route.ts
git commit -m "feat: save card details to SavedPaymentMethod after Stripe checkout"
```

---

## Task 5: Show Saved Card Option on Pay Page

**Files:**
- Modify: `src/app/pay/[token]/page.tsx`

When a client has a saved card, the pay page should show a "Pay with Visa ending 4242" button as the primary option, above the standard Stripe Checkout button.

- [ ] **Step 1: Query saved cards in the pay page**

In `src/app/pay/[token]/page.tsx`, after the invoice query (around line 20), add a query for saved cards:

```ts
// After the invoice query, look up saved cards for this client
const savedCards = !isPaid && invoice.clientId
  ? await db.savedPaymentMethod.findMany({
      where: {
        clientId: invoice.clientId,
        organizationId: invoice.organizationId,
      },
      orderBy: { isDefault: "desc" },
    })
  : [];
```

Note: Move this query after `isPaid` is computed (after line 48), since it depends on `isPaid`.

- [ ] **Step 2: Add saved card button above existing payment buttons**

In the single-payment section of `src/app/pay/[token]/page.tsx` (around line 233, the `isPayable && hasGateways` block), add the saved card option before the existing Stripe button:

```tsx
{/* Saved card — one-click pay */}
{savedCards.length > 0 && (
  <form action={`/api/pay/${token}/charge-saved`} method="POST">
    <input type="hidden" name="paymentMethodId" value={savedCards[0].stripePaymentMethodId} />
    <button
      type="submit"
      className="flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
    >
      <CreditCard className="h-4 w-4" />
      Pay with {savedCards[0].brand.charAt(0).toUpperCase() + savedCards[0].brand.slice(1)} ending {savedCards[0].last4}
    </button>
  </form>
)}
```

Also add the same for the installment blocks (around line 196), inside each installment's payment buttons:

```tsx
{savedCards.length > 0 && (
  <form action={`/api/pay/${token}/charge-saved`} method="POST">
    <input type="hidden" name="paymentMethodId" value={savedCards[0].stripePaymentMethodId} />
    <input type="hidden" name="partialPaymentId" value={inst.id} />
    <button
      type="submit"
      className="flex items-center justify-center gap-2 w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
    >
      <CreditCard className="h-4 w-4" />
      Pay with {savedCards[0].brand.charAt(0).toUpperCase() + savedCards[0].brand.slice(1)} ending {savedCards[0].last4}
    </button>
  </form>
)}
```

- [ ] **Step 3: Verify type checking passes**

Run: `npx tsc --noEmit --pretty`
Expected: No errors (the form action endpoint doesn't exist yet but that's HTML, not TS).

- [ ] **Step 4: Commit**

```bash
git add src/app/pay/[token]/page.tsx
git commit -m "feat: show saved card payment option on pay page"
```

---

## Task 6: Direct Charge API Route for Saved Cards

**Files:**
- Create: `src/app/api/pay/[token]/charge-saved/route.ts`
- Test: `src/test/charge-saved-validation.test.ts` (create)

This route charges a saved card directly via Stripe PaymentIntent (bypassing Stripe Checkout), then redirects to the success page.

- [ ] **Step 1: Write validation test**

Create `src/test/charge-saved-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("charge-saved validation", () => {
  const PAYABLE_STATUSES = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

  it("rejects non-payable statuses", () => {
    expect(PAYABLE_STATUSES.includes("DRAFT")).toBe(false);
    expect(PAYABLE_STATUSES.includes("PAID")).toBe(false);
    expect(PAYABLE_STATUSES.includes("ACCEPTED")).toBe(false);
  });

  it("accepts payable statuses", () => {
    expect(PAYABLE_STATUSES.includes("SENT")).toBe(true);
    expect(PAYABLE_STATUSES.includes("PARTIALLY_PAID")).toBe(true);
    expect(PAYABLE_STATUSES.includes("OVERDUE")).toBe(true);
  });

  it("calculates surcharge correctly", () => {
    const amount = 1000;
    const surchargePercent = 2.5;
    const charged = amount * (1 + surchargePercent / 100);
    expect(charged).toBe(1025);
    expect(Math.round(charged * 100)).toBe(102500); // cents
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/test/charge-saved-validation.test.ts`
Expected: PASS.

- [ ] **Step 3: Create the charge-saved route**

Create `src/app/api/pay/[token]/charge-saved/route.ts`:

```ts
import { db } from "@/server/db";
import { NextResponse, type NextRequest } from "next/server";
import { GatewayType, type InvoiceStatus } from "@/generated/prisma";
import { decryptJson } from "@/server/services/encryption";
import { getStripeClient } from "@/server/services/stripe";
import type { StripeConfig } from "@/server/services/gateway-config";

const PAYABLE_STATUSES: InvoiceStatus[] = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const formData = await req.formData();
  const paymentMethodId = formData.get("paymentMethodId") as string | null;
  const partialPaymentId = formData.get("partialPaymentId") as string | null;

  if (!paymentMethodId) {
    return NextResponse.json({ error: "Missing payment method" }, { status: 400 });
  }

  // Load invoice
  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    include: {
      client: true,
      currency: true,
      organization: true,
      payments: { select: { amount: true } },
      partialPayments: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (!PAYABLE_STATUSES.includes(invoice.status)) {
    return NextResponse.json({ error: "Invoice is not payable" }, { status: 400 });
  }

  if (!invoice.client.stripeCustomerId) {
    return NextResponse.json({ error: "No Stripe customer on file" }, { status: 400 });
  }

  // Verify saved card belongs to this client
  const savedCard = await db.savedPaymentMethod.findFirst({
    where: {
      stripePaymentMethodId: paymentMethodId,
      clientId: invoice.clientId,
      organizationId: invoice.organizationId,
    },
  });

  if (!savedCard) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  // Load Stripe config
  const gatewaySetting = await db.gatewaySetting.findFirst({
    where: { organizationId: invoice.organizationId, gatewayType: GatewayType.STRIPE, isEnabled: true },
  });

  if (!gatewaySetting) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  }

  const config = decryptJson<StripeConfig>(gatewaySetting.configJson);
  const stripeClient = getStripeClient(config.secretKey);

  // Calculate amount
  const total = invoice.total.toNumber();
  const paidSum = invoice.payments.reduce((s, p) => s + p.amount.toNumber(), 0);
  let chargeAmount: number;

  if (partialPaymentId) {
    const installment = invoice.partialPayments.find((pp) => pp.id === partialPaymentId);
    if (!installment || installment.isPaid) {
      return NextResponse.json({ error: "Installment not found or already paid" }, { status: 400 });
    }
    chargeAmount = installment.isPercentage
      ? total * Number(installment.amount) / 100
      : Number(installment.amount);
  } else {
    chargeAmount = total - paidSum;
  }

  if (chargeAmount <= 0) {
    return NextResponse.json({ error: "Nothing to charge" }, { status: 400 });
  }

  // Apply surcharge
  const surcharge = gatewaySetting.surcharge.toNumber();
  const finalAmount = chargeAmount * (1 + surcharge / 100);
  const amountCents = Math.round(finalAmount * 100);

  // Charge via PaymentIntent
  try {
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: amountCents,
      currency: invoice.currency.code.toLowerCase(),
      customer: invoice.client.stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        invoiceId: invoice.id,
        orgId: invoice.organizationId,
        portalToken: invoice.portalToken,
        clientId: invoice.clientId,
        ...(partialPaymentId ? { partialPaymentId } : {}),
      },
    });

    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json({ error: "Payment failed" }, { status: 402 });
    }

    // Record payment in DB (same pattern as webhook)
    const surchargeAmount = finalAmount - chargeAmount;
    await db.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          organizationId: invoice.organizationId,
          amount: chargeAmount,
          gatewayFee: 0,
          surchargeAmount: surchargeAmount > 0 ? surchargeAmount : 0,
          method: "STRIPE",
          transactionId: paymentIntent.id,
          paidAt: new Date(),
        },
      });

      if (partialPaymentId) {
        await tx.partialPayment.update({
          where: { id: partialPaymentId },
          data: { isPaid: true },
        });
      }

      // Determine new status
      const allPayments = await tx.payment.findMany({
        where: { invoiceId: invoice.id },
        select: { amount: true },
      });
      const totalPaid = allPayments.reduce((s, p) => s + p.amount.toNumber(), 0);
      const newStatus = totalPaid >= total ? "PAID" : "PARTIALLY_PAID";

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: newStatus },
      });
    });

    // Send receipt (non-blocking)
    const { sendPaymentReceiptEmail } = await import("@/server/services/payment-receipt-email");
    sendPaymentReceiptEmail({
      invoiceId: invoice.id,
      amountPaid: chargeAmount,
      organizationId: invoice.organizationId,
      partialPaymentId: partialPaymentId ?? undefined,
    }).catch((err) => console.error("Receipt email failed:", err));

    // Redirect to success page
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return NextResponse.redirect(
      `${proto}://${host}/portal/${invoice.portalToken}/payment-success`,
      303
    );
  } catch (err: unknown) {
    const stripeError = err as { type?: string; message?: string };
    if (stripeError.type === "StripeCardError") {
      return NextResponse.json({ error: stripeError.message ?? "Card declined" }, { status: 402 });
    }
    console.error("Charge failed:", err);
    return NextResponse.json({ error: "Payment failed" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verify type checking passes**

Run: `npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/pay/[token]/charge-saved/route.ts src/test/charge-saved-validation.test.ts
git commit -m "feat: add direct charge API route for saved card payments"
```

---

## Task 7: Client Portal — View and Remove Saved Cards

**Files:**
- Modify: `src/server/routers/portal.ts` — add `savedCards` and `removeCard` procedures
- Create: `src/components/portal/SavedCards.tsx`
- Modify: client portal dashboard page (where card management UI goes)

- [ ] **Step 1: Add `savedCards` query to portal router**

In `src/server/routers/portal.ts`, add a new procedure:

```ts
savedCards: publicProcedure
  .input(z.object({ clientToken: z.string() }))
  .query(async ({ ctx, input }) => {
    const client = await ctx.db.client.findUnique({
      where: { portalToken: input.clientToken },
      select: { id: true, organizationId: true },
    });
    if (!client) throw new TRPCError({ code: "NOT_FOUND" });

    return ctx.db.savedPaymentMethod.findMany({
      where: { clientId: client.id, organizationId: client.organizationId },
      select: {
        id: true,
        last4: true,
        brand: true,
        expiresMonth: true,
        expiresYear: true,
        isDefault: true,
      },
      orderBy: { isDefault: "desc" },
    });
  }),
```

- [ ] **Step 2: Add `removeCard` mutation to portal router**

```ts
removeCard: publicProcedure
  .input(z.object({ clientToken: z.string(), cardId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const client = await ctx.db.client.findUnique({
      where: { portalToken: input.clientToken },
      select: { id: true, organizationId: true, stripeCustomerId: true },
    });
    if (!client) throw new TRPCError({ code: "NOT_FOUND" });

    const card = await ctx.db.savedPaymentMethod.findFirst({
      where: { id: input.cardId, clientId: client.id, organizationId: client.organizationId },
    });
    if (!card) throw new TRPCError({ code: "NOT_FOUND" });

    // Detach from Stripe if possible
    if (client.stripeCustomerId) {
      try {
        const gw = await ctx.db.gatewaySetting.findFirst({
          where: { organizationId: client.organizationId, gatewayType: "STRIPE", isEnabled: true },
        });
        if (gw) {
          const { decryptJson } = await import("@/server/services/encryption");
          const { getStripeClient } = await import("@/server/services/stripe");
          const config = decryptJson<{ secretKey: string }>(gw.configJson);
          const stripe = getStripeClient(config.secretKey);
          await stripe.paymentMethods.detach(card.stripePaymentMethodId);
        }
      } catch (err) {
        console.error("Failed to detach card from Stripe:", err);
      }
    }

    await ctx.db.savedPaymentMethod.delete({ where: { id: card.id } });
    return { success: true };
  }),
```

- [ ] **Step 3: Create SavedCards component**

Create `src/components/portal/SavedCards.tsx`:

```tsx
"use client";

import { api } from "@/trpc/react";
import { CreditCard, Trash2 } from "lucide-react";
import { toast } from "sonner";

function brandLabel(brand: string): string {
  const brands: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    discover: "Discover",
  };
  return brands[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

export function SavedCards({ clientToken }: { clientToken: string }) {
  const { data: cards, refetch } = api.portal.savedCards.useQuery({ clientToken });
  const removeCard = api.portal.removeCard.useMutation({
    onSuccess: () => {
      toast.success("Card removed");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!cards || cards.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-muted-foreground" />
        Saved Payment Methods
      </h3>
      <div className="space-y-2">
        {cards.map((card) => (
          <div key={card.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                {brandLabel(card.brand)} ending {card.last4}
              </span>
              <span className="text-xs text-muted-foreground">
                Expires {card.expiresMonth.toString().padStart(2, "0")}/{card.expiresYear}
              </span>
              {card.isDefault && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  Default
                </span>
              )}
            </div>
            <button
              onClick={() => removeCard.mutate({ clientToken, cardId: card.id })}
              disabled={removeCard.isPending}
              className="text-muted-foreground hover:text-red-600 transition-colors p-1"
              aria-label="Remove card"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add SavedCards to client portal dashboard**

Find the client portal dashboard page (likely `src/app/portal/dashboard/[clientToken]/page.tsx`) and add the `SavedCards` component. Import and place it after the existing content:

```tsx
import { SavedCards } from "@/components/portal/SavedCards";

// In the JSX, add after the existing portal content:
<SavedCards clientToken={clientToken} />
```

- [ ] **Step 5: Verify type checking passes**

Run: `npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/routers/portal.ts src/components/portal/SavedCards.tsx src/app/portal/dashboard/*/page.tsx
git commit -m "feat: add saved card management to client portal"
```

---

## Task 8: Make Dashboard Cards Link to Filtered Invoice Lists

**Files:**
- Modify: `src/components/dashboard/SummaryCards.tsx` (lines 43-71 — href values)

The Outstanding and Overdue cards currently link to `/invoices` without filters. Adding query params will let freelancers jump directly to the relevant subset.

- [ ] **Step 1: Verify the invoices list page supports URL filter params**

Check `src/app/(dashboard)/invoices/page.tsx` for `searchParams` usage. The invoice list page should already read status filters from the URL. If it uses client-side state, we'll need to check the component.

Run: `grep -n "searchParams\|useSearchParams\|status" src/app/\(dashboard\)/invoices/page.tsx | head -20`

- [ ] **Step 2: Update href values in SummaryCards**

In `src/components/dashboard/SummaryCards.tsx`, update the `href` values:

Change the Outstanding card's href (around line 53):
```ts
href: "/invoices?status=SENT&status=PARTIALLY_PAID&status=OVERDUE",
```

Change the Overdue card's href (around line 71):
```ts
href: "/invoices?status=OVERDUE",
```

- [ ] **Step 3: If invoice list doesn't read URL params, add support**

If the invoice list page uses client-side state for filters, update the filter component to initialize from `searchParams`. This is conditional — only needed if URL params aren't already supported.

- [ ] **Step 4: Verify navigation works**

Run: `npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/SummaryCards.tsx
git commit -m "feat: link dashboard cards to filtered invoice lists"
```

---

## Task 9: Add "Due This Week" Dashboard Widget

**Files:**
- Modify: `src/server/routers/dashboard.ts` — add `dueThisWeek` procedure
- Create: `src/components/dashboard/DueThisWeek.tsx`
- Modify: `src/app/(dashboard)/page.tsx` — add the widget
- Test: `src/test/due-this-week.test.ts` (create)

A compact widget showing invoices due in the next 7 days, giving freelancers a heads-up on upcoming deadlines.

- [ ] **Step 1: Write test for the due-this-week date range logic**

Create `src/test/due-this-week.test.ts`:

```ts
import { describe, it, expect } from "vitest";

/**
 * Helper to build the Prisma WHERE clause for due-this-week invoices.
 */
export function buildDueThisWeekWhere(orgId: string, now: Date) {
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  endOfWeek.setHours(23, 59, 59, 999);

  return {
    organizationId: orgId,
    status: { in: ["SENT", "PARTIALLY_PAID"] as const },
    isArchived: false,
    dueDate: {
      gte: now,
      lte: endOfWeek,
    },
  };
}

describe("buildDueThisWeekWhere", () => {
  it("sets date range from now to 7 days ahead", () => {
    const now = new Date("2026-04-05T12:00:00Z");
    const where = buildDueThisWeekWhere("org1", now);

    expect(where.dueDate.gte).toEqual(now);
    expect(where.dueDate.lte.getDate()).toBe(12); // April 12
    expect(where.dueDate.lte.getHours()).toBe(23);
  });

  it("excludes archived invoices", () => {
    const now = new Date();
    const where = buildDueThisWeekWhere("org1", now);
    expect(where.isArchived).toBe(false);
  });

  it("only includes SENT and PARTIALLY_PAID statuses", () => {
    const now = new Date();
    const where = buildDueThisWeekWhere("org1", now);
    expect(where.status.in).toEqual(["SENT", "PARTIALLY_PAID"]);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/test/due-this-week.test.ts`
Expected: PASS.

- [ ] **Step 3: Add `dueThisWeek` procedure to dashboard router**

In `src/server/routers/dashboard.ts`, add:

```ts
dueThisWeek: protectedProcedure
  .query(async ({ ctx }) => {
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    endOfWeek.setHours(23, 59, 59, 999);

    const invoices = await ctx.db.invoice.findMany({
      where: {
        organizationId: ctx.orgId,
        status: { in: ["SENT", "PARTIALLY_PAID"] },
        isArchived: false,
        dueDate: { gte: now, lte: endOfWeek },
      },
      select: {
        id: true,
        number: true,
        total: true,
        dueDate: true,
        status: true,
        client: { select: { name: true } },
        payments: { select: { amount: true } },
        currency: { select: { symbol: true, symbolPosition: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 10,
    });

    return invoices.map((inv) => {
      const paid = inv.payments.reduce((s, p) => s + p.amount.toNumber(), 0);
      return {
        id: inv.id,
        number: inv.number,
        clientName: inv.client.name,
        total: inv.total.toNumber(),
        remaining: inv.total.toNumber() - paid,
        dueDate: inv.dueDate!.toISOString(),
        currencySymbol: inv.currency.symbol,
        symbolPosition: inv.currency.symbolPosition,
      };
    });
  }),
```

- [ ] **Step 4: Create DueThisWeek component**

Create `src/components/dashboard/DueThisWeek.tsx`:

```tsx
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { formatCurrency } from "@/lib/format";

type DueInvoice = {
  id: string;
  number: string;
  clientName: string;
  total: number;
  remaining: number;
  dueDate: string;
  currencySymbol: string;
  symbolPosition: string;
};

function daysUntil(dateStr: string): number {
  const now = new Date();
  const due = new Date(dateStr);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function dueLabel(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days <= 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

export function DueThisWeek({ data }: { data: DueInvoice[] }) {
  const totalDue = data.reduce((s, inv) => s + inv.remaining, 0);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-amber-500" />
          Due This Week
        </h3>
        {data.length > 0 && (
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700">
            {data.length} invoice{data.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing due this week</p>
      ) : (
        <>
          <div className="space-y-2 mb-3">
            {data.map((inv) => (
              <Link
                key={inv.id}
                href={`/invoices/${inv.id}`}
                className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">
                    #{inv.number} — {inv.clientName}
                  </p>
                  <p className="text-xs text-muted-foreground">{dueLabel(inv.dueDate)}</p>
                </div>
                <p className="text-sm font-semibold">
                  {formatCurrency(inv.remaining, inv.currencySymbol, inv.symbolPosition)}
                </p>
              </Link>
            ))}
          </div>
          <div className="border-t border-border/50 pt-2 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Total due</span>
            <span className="text-sm font-bold">${totalDue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add DueThisWeek to the dashboard page**

In `src/app/(dashboard)/page.tsx`, add an import and async section:

```tsx
import { DueThisWeek } from "@/components/dashboard/DueThisWeek";
```

Add a new async section function:

```tsx
async function DueThisWeekSection() {
  const data = await api.dashboard.dueThisWeek();
  return <DueThisWeek data={data} />;
}
```

In the `InsightsSection`, add the `dueThisWeek` query and change the grid to 4 columns:

```tsx
async function InsightsSection() {
  const [topClients, aging, conversion, dueThisWeek] = await Promise.all([
    api.dashboard.topClients(),
    api.dashboard.agingReceivables(),
    api.dashboard.estimateConversion(),
    api.dashboard.dueThisWeek(),
  ]);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
      <TopClients data={topClients} />
      <AgingReceivables data={aging} />
      <DueThisWeek data={dueThisWeek} />
      <EstimateConversion data={conversion} />
    </div>
  );
}
```

Remove the standalone `DueThisWeekSection` function if you added it — it's better as part of InsightsSection to batch the queries.

- [ ] **Step 6: Verify type checking passes**

Run: `npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/routers/dashboard.ts src/components/dashboard/DueThisWeek.tsx src/app/\(dashboard\)/page.tsx src/test/due-this-week.test.ts
git commit -m "feat: add Due This Week widget to dashboard"
```

---

## Summary

| Task | Feature | What's Built | Effort |
|------|---------|-------------|--------|
| 1 | One-tap pay from email | Change CTA from "View Invoice" → "Pay $X Now" | Small |
| 2 | Receipt email enhancement | Add "Pay Remaining" CTA for partial payments | Small |
| 3 | SavedPaymentMethod model | Prisma migration for saved card tracking | Small |
| 4 | Save card after checkout | Webhook saves card details to new model | Medium |
| 5 | Show saved card on pay page | One-click pay with saved card button | Medium |
| 6 | Direct charge route | Charge saved card via PaymentIntent | Medium |
| 7 | Client portal card management | View/remove saved cards | Medium |
| 8 | Dashboard filter links | SummaryCards link to filtered invoice list | Small |
| 9 | Due This Week widget | New dashboard widget for upcoming deadlines | Medium |

**Dependencies:** Tasks 1-2 are independent. Tasks 3→4→5→6→7 are sequential (model → save → display → charge → manage). Tasks 8-9 are independent of everything else.

**Parallelizable groups:**
- Group A: Tasks 1, 2 (email enhancements)
- Group B: Tasks 3, 4, 5, 6, 7 (saved cards — sequential)
- Group C: Tasks 8, 9 (dashboard — independent)
