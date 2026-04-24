import { db } from "@/server/db";
import { notFound } from "next/navigation";
import { GatewayType, type InvoiceStatus } from "@/generated/prisma";
import { decryptJson } from "@/server/services/encryption";
import type { PayPalConfig } from "@/server/services/gateway-config";
import { headers } from "next/headers";
import Link from "next/link";
import { CheckCircle2, CreditCard } from "lucide-react";
import { formatCurrency, formatDateLong } from "@/lib/format";

const PAYABLE_STATUSES: InvoiceStatus[] = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    include: {
      organization: true,
      currency: true,
      payments: { select: { amount: true } },
      partialPayments: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!invoice) notFound();
  const inv = invoice;

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const appUrl = `${proto}://${host}`;

  const sym = invoice.currency.symbol;
  const symPos = invoice.currency.symbolPosition;
  const f = (n: number) => formatCurrency(n, sym, symPos);

  const total = invoice.total.toNumber();
  const paidSum = invoice.payments.reduce(
    (sum, p) => sum + p.amount.toNumber(),
    0,
  );
  const remaining = total - paidSum;

  const isPaid = invoice.status === "PAID" || remaining <= 0;
  const isPayable = PAYABLE_STATUSES.includes(invoice.status);

  // Load enabled gateways
  const gatewayRows = !isPaid
    ? await db.gatewaySetting.findMany({
        where: { organizationId: invoice.organizationId, isEnabled: true },
        select: {
          gatewayType: true,
          surcharge: true,
          label: true,
          configJson: true,
        },
      })
    : [];

  const stripeGw = gatewayRows.find(
    (g) => g.gatewayType === GatewayType.STRIPE,
  );
  const paypalGw = gatewayRows.find(
    (g) => g.gatewayType === GatewayType.PAYPAL,
  );

  // PayPal config for building URLs per installment
  let paypalConfig: PayPalConfig | undefined;
  if (paypalGw) {
    try {
      paypalConfig = decryptJson<PayPalConfig>(paypalGw.configJson);
    } catch {
      // configJson not set yet
    }
  }

  function buildPaypalUrl(amount: number, label: string) {
    if (!paypalConfig || !paypalGw) return undefined;
    const chargedAmount = (
      amount * (1 + paypalGw.surcharge.toNumber() / 100)
    ).toFixed(2);
    return `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(paypalConfig.email)}&amount=${chargedAmount}&currency_code=${inv.currency.code}&item_name=${encodeURIComponent(label)}&return=${encodeURIComponent(`${appUrl}/pay/${token}/success`)}`;
  }

  const hasGateways = !!stripeGw || !!paypalConfig;
  const orgLogo = invoice.organization.logoUrl;
  const orgName = invoice.organization.name;

  // Build installment list for split payments
  const unpaidInstallments = invoice.partialPayments
    .filter((pp) => !pp.isPaid)
    .map((pp, idx) => {
      const amount = pp.isPercentage
        ? total * Number(pp.amount) / 100
        : Number(pp.amount);
      return {
        id: pp.id,
        label: `Installment #${idx + 1}`,
        amount,
        dueDate: pp.dueDate,
        percentage: pp.isPercentage ? Number(pp.amount) : undefined,
      };
    });

  const hasInstallments = invoice.partialPayments.length > 0;

  // Load saved payment methods for this client
  const savedCards = !isPaid && invoice.clientId
    ? await db.savedPaymentMethod.findMany({
        where: {
          clientId: invoice.clientId,
          organizationId: invoice.organizationId,
        },
        orderBy: { isDefault: "desc" },
      })
    : [];

  return (
    <main aria-label="Payment" className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border/50 bg-card shadow-lg overflow-hidden">
        <div className="p-8 space-y-6">
          {/* Org branding */}
          <div className="flex flex-col items-center gap-3">
            {orgLogo && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={orgLogo}
                alt={orgName}
                className="h-12 w-auto max-w-[160px] rounded-lg object-contain"
              />
            )}
            <p className="text-sm font-medium text-muted-foreground">
              {orgName}
            </p>
          </div>

          {isPaid ? (
            /* Paid confirmation */
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="rounded-full bg-emerald-100 p-4">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
              <div className="text-center space-y-1">
                <h1 className="text-2xl font-bold text-foreground">
                  Invoice Paid
                </h1>
                <p className="text-sm text-muted-foreground">
                  Invoice #{invoice.number} has been paid in full. Thank you!
                </p>
              </div>
            </div>
          ) : (
            /* Payable state */
            <>
              {/* Invoice label + total */}
              <div className="text-center space-y-1">
                <p className="text-sm text-muted-foreground">
                  Invoice #{invoice.number}
                </p>
                <p className="text-4xl font-bold text-foreground tracking-tight">
                  {f(remaining)}
                </p>
                {invoice.dueDate && (
                  <p className="text-sm text-muted-foreground">
                    Due {formatDateLong(invoice.dueDate)}
                  </p>
                )}
              </div>

              {/* Split payment installments */}
              {isPayable && hasGateways && hasInstallments && unpaidInstallments.length > 0 ? (
                <div className="space-y-4">
                  {unpaidInstallments.map((inst) => {
                    const stripeUrl = `/api/pay/${token}/stripe?partialPaymentId=${inst.id}`;
                    const ppUrl = buildPaypalUrl(
                      inst.amount,
                      `Invoice #${invoice.number} — ${inst.label}`,
                    );
                    return (
                      <div
                        key={inst.id}
                        className="rounded-xl border border-border/50 p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {inst.label}
                              {inst.percentage != null && (
                                <span className="text-muted-foreground font-normal">
                                  {" "}({inst.percentage}%)
                                </span>
                              )}
                            </p>
                            {inst.dueDate && (
                              <p className="text-xs text-muted-foreground">
                                Due {formatDateLong(inst.dueDate)}
                              </p>
                            )}
                          </div>
                          <p className="text-lg font-bold text-foreground">
                            {f(inst.amount)}
                          </p>
                        </div>
                        <div className="space-y-2">
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
                          {stripeGw && (
                            <a
                              href={stripeUrl}
                              className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                            >
                              <CreditCard className="h-4 w-4" />
                              Pay with Card
                              {stripeGw.surcharge.toNumber() > 0 && (
                                <span className="text-xs font-normal opacity-75">
                                  (+{stripeGw.surcharge.toNumber()}% surcharge)
                                </span>
                              )}
                            </a>
                          )}
                          {ppUrl && (
                            <a
                              href={ppUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-2 w-full rounded-lg border border-border px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                            >
                              Pay with PayPal
                              {paypalGw && paypalGw.surcharge.toNumber() > 0 && (
                                <span className="text-xs font-normal text-muted-foreground">
                                  (+{paypalGw.surcharge.toNumber()}% surcharge)
                                </span>
                              )}
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : isPayable && hasGateways ? (
                /* No installments — single payment */
                <div className="space-y-3">
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
                  {stripeGw && (
                    <a
                      href={`/api/pay/${token}/stripe`}
                      className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <CreditCard className="h-4 w-4" />
                      Pay with Card
                      {stripeGw.surcharge.toNumber() > 0 && (
                        <span className="text-xs font-normal opacity-75">
                          (+{stripeGw.surcharge.toNumber()}% surcharge)
                        </span>
                      )}
                    </a>
                  )}
                  {(() => {
                    const ppUrl = buildPaypalUrl(remaining, `Invoice #${invoice.number}`);
                    return ppUrl ? (
                      <a
                        href={ppUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                      >
                        Pay with PayPal
                        {paypalGw && paypalGw.surcharge.toNumber() > 0 && (
                          <span className="text-xs font-normal text-muted-foreground">
                            (+{paypalGw.surcharge.toNumber()}% surcharge)
                          </span>
                        )}
                      </a>
                    ) : null;
                  })()}
                </div>
              ) : isPayable ? (
                <p className="text-center text-sm text-muted-foreground">
                  No online payment methods available.
                </p>
              ) : (
                <p className="text-center text-sm text-muted-foreground">
                  This invoice is not currently payable online.
                </p>
              )}
            </>
          )}

          {/* View full invoice link */}
          <div className="pt-2 text-center">
            <Link
              href={`/portal/${token}`}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
            >
              View full invoice
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
