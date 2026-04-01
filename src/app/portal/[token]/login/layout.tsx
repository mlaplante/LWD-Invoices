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
