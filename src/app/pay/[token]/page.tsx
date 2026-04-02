import { db } from "@/server/db";
import { notFound } from "next/navigation";
import { GatewayType, type InvoiceStatus } from "@/generated/prisma";
import { decryptJson } from "@/server/services/encryption";
import type { PayPalConfig } from "@/server/services/gateway-config";
import { headers } from "next/headers";
import Link from "next/link";
import { CheckCircle2, CreditCard } from "lucide-react";
import Image from "next/image";
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
    },
  });

  if (!invoice) notFound();

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

  // Build PayPal URL
  let paypalUrl: string | undefined;
  if (paypalGw) {
    try {
      const config = decryptJson<PayPalConfig>(paypalGw.configJson);
      const chargedAmount = (
        remaining *
        (1 + paypalGw.surcharge.toNumber() / 100)
      ).toFixed(2);
      paypalUrl = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(config.email)}&amount=${chargedAmount}&currency_code=${invoice.currency.code}&item_name=${encodeURIComponent(`Invoice ${invoice.number}`)}&return=${encodeURIComponent(`${appUrl}/pay/${token}/success`)}`;
    } catch {
      // configJson not set yet
    }
  }

  const hasGateways = !!stripeGw || !!paypalUrl;
  const orgLogo = invoice.organization.logoUrl;
  const orgName = invoice.organization.name;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border/50 bg-card shadow-lg overflow-hidden">
        <div className="p-8 space-y-6">
          {/* Org branding */}
          <div className="flex flex-col items-center gap-3">
            {orgLogo && (
              <Image
                src={orgLogo}
                alt={orgName}
                width={48}
                height={48}
                className="rounded-lg object-contain"
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
              {/* Invoice label + amount */}
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

              {/* Payment buttons */}
              {isPayable && hasGateways ? (
                <div className="space-y-3">
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
                  {paypalUrl && (
                    <a
                      href={paypalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                    >
                      Pay with PayPal
                      {paypalGw &&
                        paypalGw.surcharge.toNumber() > 0 && (
                          <span className="text-xs font-normal text-muted-foreground">
                            (+{paypalGw.surcharge.toNumber()}% surcharge)
                          </span>
                        )}
                    </a>
                  )}
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
    </div>
  );
}
