# Split Payments Gateway Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable clients to pay individual installments or the full remaining balance via Stripe and PayPal through the portal.

**Architecture:** Extend the existing `createStripeCheckout` mutation and `createCheckoutSession` helper to accept an optional `partialPaymentId`. The Stripe webhook uses this metadata to mark specific installments paid and set invoice status to `PARTIALLY_PAID` or `PAID`. PayPal URLs are built server-side per installment. The portal UI renders per-installment pay buttons when a schedule exists.

**Tech Stack:** Stripe API, tRPC, Prisma, React, Next.js

---

### Task 1: Extend Stripe Checkout to Support Partial Payments

**Files:**
- Modify: `src/server/services/stripe.ts`
- Modify: `src/server/routers/portal.ts`

**Step 1: Add optional parameters to `createCheckoutSession`**

In `src/server/services/stripe.ts`, extend the `opts` type and amount logic:

```tsx
export async function createCheckoutSession(opts: {
  stripeClient: Stripe;
  invoice: {
    id: string;
    number: string;
    total: Decimal;
    currency: { code: string };
    portalToken: string;
    organizationId: string;
  };
  surcharge: number;
  appUrl: string;
  partialPaymentId?: string;
  amountOverride?: number; // pre-calculated amount (before surcharge)
}): Promise<{ url: string; sessionId: string }> {
  const { stripeClient, invoice, surcharge, appUrl, partialPaymentId, amountOverride } = opts;

  const baseAmount = amountOverride ?? invoice.total.toNumber();
  const chargedAmount = baseAmount * (1 + surcharge / 100);
  const amountCents = Math.round(chargedAmount * 100);

  const itemName = partialPaymentId
    ? `Invoice #${invoice.number} — Installment`
    : `Invoice #${invoice.number}`;

  const metadata: Record<string, string> = {
    invoiceId: invoice.id,
    orgId: invoice.organizationId,
    portalToken: invoice.portalToken,
  };
  if (partialPaymentId) {
    metadata.partialPaymentId = partialPaymentId;
  }

  const session = await stripeClient.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: invoice.currency.code.toLowerCase(),
          unit_amount: amountCents,
          product_data: { name: itemName },
        },
      },
    ],
    metadata,
    success_url: `${appUrl}/portal/${invoice.portalToken}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/portal/${invoice.portalToken}`,
  });

  if (!session.url) throw new Error("Stripe session URL missing");
  return { url: session.url, sessionId: session.id };
}
```

**Step 2: Extend `createStripeCheckout` mutation in portal router**

In `src/server/routers/portal.ts`, update the mutation input and add amount resolution:

```tsx
  createStripeCheckout: publicProcedure
    .input(z.object({
      token: z.string(),
      partialPaymentId: z.string().optional(),
      payFullBalance: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await getInvoiceByToken(ctx.db, input.token);

      if (!PAYABLE_STATUSES.includes(invoice.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice is not payable" });
      }

      const gateway = await ctx.db.gatewaySetting.findUnique({
        where: {
          organizationId_gatewayType: {
            organizationId: invoice.organizationId,
            gatewayType: GatewayType.STRIPE,
          },
        },
      });
      if (!gateway?.isEnabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Stripe is not enabled" });
      }

      // Resolve amount
      let amountOverride: number | undefined;
      let partialPaymentId: string | undefined;

      if (input.partialPaymentId) {
        const pp = await ctx.db.partialPayment.findUnique({
          where: { id: input.partialPaymentId },
        });
        if (!pp || pp.invoiceId !== invoice.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Installment not found" });
        }
        if (pp.isPaid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Installment already paid" });
        }
        amountOverride = pp.isPercentage
          ? (pp.amount.toNumber() / 100) * invoice.total.toNumber()
          : pp.amount.toNumber();
        partialPaymentId = pp.id;
      } else if (input.payFullBalance) {
        const totalPaid = invoice.payments.reduce(
          (sum, p) => sum + p.amount.toNumber(), 0
        );
        amountOverride = invoice.total.toNumber() - totalPaid;
        if (amountOverride <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No balance remaining" });
        }
      }

      const config = decryptJson<StripeConfig>(gateway.configJson);
      const stripeClient = getStripeClient(config.secretKey);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

      const { url } = await createCheckoutSession({
        stripeClient,
        invoice: {
          id: invoice.id,
          number: invoice.number,
          total: invoice.total,
          currency: invoice.currency,
          portalToken: invoice.portalToken,
          organizationId: invoice.organizationId,
        },
        surcharge: gateway.surcharge.toNumber(),
        appUrl,
        partialPaymentId,
        amountOverride,
      });

      return { url };
    }),
```

**Step 3: Verify build**

Run: `cd /Users/mlaplante/Sites/pancake && npx next build 2>&1 | tail -15`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/server/services/stripe.ts src/server/routers/portal.ts
git commit -m "feat: extend Stripe checkout to support installment and balance payments"
```

---

### Task 2: Update Stripe Webhook for Partial Payment Handling

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`

**Step 1: Replace the transaction block with partial payment-aware logic**

In `src/app/api/webhooks/stripe/route.ts`, replace the existing transaction block (lines 94-110) and adjust the invoice query to include partialPayments:

Change the invoice query (line 75-78) to:
```tsx
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId, organizationId: orgId },
      select: { id: true, total: true, status: true },
      include: { partialPayments: true, payments: true },
    });
```

Note: You can't use both `select` and `include` — switch to `include` only:
```tsx
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId, organizationId: orgId },
      include: { partialPayments: true, payments: true },
    });
```

Replace the transaction block (lines 94-110) with:

```tsx
    const partialPaymentId = session.metadata?.partialPaymentId;
    const amountTotal = session.amount_total ?? 0;
    const chargedAmount = amountTotal / 100;

    await db.$transaction(async (tx) => {
      if (partialPaymentId) {
        // ── Installment payment ──────────────────────────────
        const pp = await tx.partialPayment.findUnique({
          where: { id: partialPaymentId },
        });

        // Idempotency: already paid
        if (pp?.isPaid) return;

        const installmentAmount = pp
          ? (pp.isPercentage
              ? (pp.amount.toNumber() / 100) * invoice.total.toNumber()
              : pp.amount.toNumber())
          : chargedAmount;

        const surchargeAmount = Math.max(0, chargedAmount - installmentAmount);

        await tx.payment.create({
          data: {
            amount: installmentAmount,
            surchargeAmount,
            method: "stripe",
            transactionId: (session.payment_intent as string | undefined) ?? session.id,
            invoiceId,
            organizationId: orgId,
          },
        });

        if (pp) {
          await tx.partialPayment.update({
            where: { id: partialPaymentId },
            data: { isPaid: true, paidAt: new Date(), paymentMethod: "stripe", transactionId: (session.payment_intent as string | undefined) ?? session.id },
          });
        }

        // Check if all installments are now paid
        const allPartials = await tx.partialPayment.findMany({
          where: { invoiceId },
        });
        const allPaid = allPartials.length > 0 && allPartials.every((p) => p.isPaid);

        await tx.invoice.update({
          where: { id: invoiceId, organizationId: orgId },
          data: { status: allPaid ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID },
        });
      } else {
        // ── Full payment (original flow or pay full balance) ──
        const invoiceTotal = invoice.total.toNumber();
        const totalPreviouslyPaid = invoice.payments.reduce(
          (sum, p) => sum + p.amount.toNumber(), 0
        );
        const paymentAmount = Math.max(0, invoiceTotal - totalPreviouslyPaid);
        const surchargeAmount = Math.max(0, chargedAmount - paymentAmount);

        await tx.payment.create({
          data: {
            amount: paymentAmount > 0 ? paymentAmount : chargedAmount,
            surchargeAmount,
            method: "stripe",
            transactionId: (session.payment_intent as string | undefined) ?? session.id,
            invoiceId,
            organizationId: orgId,
          },
        });

        // Mark all unpaid installments as paid
        await tx.partialPayment.updateMany({
          where: { invoiceId, isPaid: false },
          data: { isPaid: true, paidAt: new Date(), paymentMethod: "stripe" },
        });

        await tx.invoice.update({
          where: { id: invoiceId, organizationId: orgId },
          data: { status: InvoiceStatus.PAID },
        });
      }
    });
```

Also update the idempotency check (line 85-87). Remove the early return for `PAID` status when there's a `partialPaymentId`, since the invoice may be partially paid but a specific installment still unpaid:

```tsx
    const partialPaymentIdFromMeta = session.metadata?.partialPaymentId;

    // Idempotency: skip if fully paid AND no specific installment targeted
    if (invoice.status === InvoiceStatus.PAID && !partialPaymentIdFromMeta) {
      return NextResponse.json({ received: true });
    }
```

**Step 2: Verify build**

Run: `cd /Users/mlaplante/Sites/pancake && npx next build 2>&1 | tail -15`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "feat: handle installment payments in Stripe webhook with status progression"
```

---

### Task 3: Update Portal UI with Per-Installment Payment Buttons

**Files:**
- Modify: `src/components/portal/PaymentButtons.tsx`
- Modify: `src/app/portal/[token]/page.tsx`

**Step 1: Add optional props to PaymentButtons**

In `src/components/portal/PaymentButtons.tsx`, extend Props and the Stripe mutation:

```tsx
type Props = {
  token: string;
  gateways: Gateway[];
  total: string;
  orgName: string;
  partialPaymentId?: string;
  payFullBalance?: boolean;
  label?: string;
};

export function PaymentButtons({ token, gateways, total, orgName, partialPaymentId, payFullBalance, label }: Props) {
```

Update `handleStripe` to pass the new parameters:

```tsx
  const handleStripe = () => {
    setError("");
    setLoading("stripe");
    createStripeCheckout.mutate({
      token,
      partialPaymentId,
      payFullBalance,
    });
  };
```

Update the heading to use `label` prop:

```tsx
      <h2 className="text-base font-semibold text-foreground mb-4">{label ?? "Pay Now"}</h2>
```

**Step 2: Update the portal page to render per-installment buttons**

In `src/app/portal/[token]/page.tsx`, the PayPal URL construction (around line 85-93) needs a helper function to build URLs for specific amounts. Add this helper after the `gateways` construction:

```tsx
  function buildPayPalUrl(amount: number): string | undefined {
    const paypalGateway = gatewayRows.find((g) => g.gatewayType === GatewayType.PAYPAL);
    if (!paypalGateway) return undefined;
    try {
      const config = decryptJson<PayPalConfig>(paypalGateway.configJson);
      const chargedAmount = (amount * (1 + paypalGateway.surcharge.toNumber() / 100)).toFixed(2);
      return `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(config.email)}&amount=${chargedAmount}&currency_code=${invoice.currency.code}&item_name=${encodeURIComponent(`Invoice ${invoice.number}`)}`;
    } catch {
      return undefined;
    }
  }
```

Then replace the existing `{/* Payment buttons */}` section with logic that checks for a payment schedule:

```tsx
        {/* Payment buttons */}
        {isPayable && gateways.length > 0 && invoice.partialPayments.length > 0 ? (
          <>
            {/* Per-installment pay buttons */}
            {invoice.partialPayments
              .filter((pp) => !pp.isPaid)
              .map((pp, i) => {
                const installmentAmount = pp.isPercentage
                  ? (Number(pp.amount) / 100) * Number(invoice.total)
                  : Number(pp.amount);
                const installmentGateways = gateways.map((g) => ({
                  ...g,
                  paypalUrl: g.gatewayType === "PAYPAL"
                    ? buildPayPalUrl(installmentAmount)
                    : undefined,
                }));
                return (
                  <PaymentButtons
                    key={pp.id}
                    token={token}
                    gateways={installmentGateways}
                    total={f(installmentAmount)}
                    orgName={invoice.organization.name}
                    partialPaymentId={pp.id}
                    label={`Pay Installment ${i + 1}`}
                  />
                );
              })}
            {/* Pay full balance button */}
            {(() => {
              const totalPaid = invoice.payments.reduce(
                (sum, p) => sum + Number(p.amount), 0
              );
              const remaining = Number(invoice.total) - totalPaid;
              if (remaining <= 0) return null;
              const balanceGateways = gateways.map((g) => ({
                ...g,
                paypalUrl: g.gatewayType === "PAYPAL"
                  ? buildPayPalUrl(remaining)
                  : undefined,
              }));
              return (
                <PaymentButtons
                  token={token}
                  gateways={balanceGateways}
                  total={f(remaining)}
                  orgName={invoice.organization.name}
                  payFullBalance
                  label="Pay Full Balance"
                />
              );
            })()}
          </>
        ) : isPayable && gateways.length > 0 ? (
          <PaymentButtons
            token={token}
            gateways={gateways}
            total={f(invoice.total)}
            orgName={invoice.organization.name}
          />
        ) : null}
```

**Step 3: Verify build**

Run: `cd /Users/mlaplante/Sites/pancake && npx next build 2>&1 | tail -15`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/portal/PaymentButtons.tsx src/app/portal/\[token\]/page.tsx
git commit -m "feat: add per-installment and full-balance payment buttons to portal"
```

---

### Task 4: Build Verification and Testing

**Files:** None (testing only)

**Step 1: Full build check**

Run: `cd /Users/mlaplante/Sites/pancake && npx next build 2>&1 | tail -15`
Expected: Build succeeds

**Step 2: Run existing tests**

Run: `cd /Users/mlaplante/Sites/pancake && npx vitest run 2>&1 | tail -15`
Expected: All existing tests pass (ignore stale worktree failures)

**Step 3: Manual testing checklist**

1. Invoice without payment schedule → portal shows standard "Pay Now" buttons (unchanged behavior)
2. Invoice with 3-installment schedule → portal shows 3 "Pay Installment N" sections + "Pay Full Balance" section
3. Click Stripe "Pay" on an installment → Stripe checkout shows correct installment amount + surcharge
4. After Stripe payment succeeds → webhook marks that installment paid, invoice status becomes `PARTIALLY_PAID`
5. Pay all remaining installments → invoice status becomes `PAID`
6. Click "Pay Full Balance" → charges remaining balance, marks all installments paid, status `PAID`
7. PayPal buttons show correct per-installment amounts in URL

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during split payment gateway testing"
```
