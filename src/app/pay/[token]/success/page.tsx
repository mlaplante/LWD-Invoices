import { db } from "@/server/db";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { PortalShell } from "@/components/portal/PortalShell";
import { getPortalBranding } from "@/lib/portal-branding";

export default async function PaySuccessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    include: {
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
      currency: { select: { symbol: true, symbolPosition: true } },
    },
  });

  if (!invoice) notFound();

  const branding = getPortalBranding(invoice.organization);
  const sym = invoice.currency.symbol;
  const symPos = invoice.currency.symbolPosition;
  const fmtAmount = (n: number) => formatCurrency(n, sym, symPos);

  return (
    <PortalShell branding={branding}>
      <div className="max-w-md mx-auto text-center py-8">
        <div
          className="rounded-full p-4 w-fit mx-auto mb-4"
          style={{ backgroundColor: `${branding.brandColor}15` }}
        >
          <CheckCircle2 className="h-10 w-10" style={{ color: branding.brandColor }} />
        </div>

        <h2 className="text-2xl font-bold mb-1">Payment received</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Thank you for your payment of {fmtAmount(Number(invoice.total))} for
          Invoice #{invoice.number}.
        </p>
        <p className="text-xs text-muted-foreground">
          {invoice.organization.name} will send a receipt to your email.
        </p>
        <div className="mt-6">
          <Link
            href={`/portal/${token}`}
            className="text-sm underline underline-offset-4 hover:opacity-80 transition-opacity"
            style={{ color: branding.brandColor }}
          >
            View invoice details
          </Link>
        </div>
      </div>
    </PortalShell>
  );
}
