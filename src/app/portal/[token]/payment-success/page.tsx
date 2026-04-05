import Link from "next/link";
import { db } from "@/server/db";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Download, CheckCircle2 } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { getPortalBranding } from "@/lib/portal-branding";

export default async function PaymentSuccessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    select: {
      number: true,
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

  if (!invoice) notFound();

  const branding = getPortalBranding(invoice.organization);

  return (
    <PortalShell branding={branding}>
      <div className="max-w-md mx-auto text-center py-8">
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: `${branding.brandColor}15` }}
        >
          <CheckCircle2 className="h-8 w-8" style={{ color: branding.brandColor }} />
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-2">Payment Received!</h2>
        <p className="text-muted-foreground mb-1">
          Thank you for your payment on invoice <strong>#{invoice.number}</strong>.
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          A receipt has been sent to your email address.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild style={{ backgroundColor: branding.brandColor }} className="text-white hover:opacity-90">
            <a href={`/api/portal/${token}/pdf`} download>
              <Download className="w-4 h-4" />
              Download Receipt
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/portal/${token}`}>Back to Invoice</Link>
          </Button>
        </div>
      </div>
    </PortalShell>
  );
}
