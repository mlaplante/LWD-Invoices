import { db } from "@/server/db";
import { isSessionExpired } from "@/server/services/portal-dashboard";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPortalBranding } from "@/lib/portal-branding";
import { PortalShell } from "@/components/portal/PortalShell";

export default async function PortalDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientToken: string }>;
}) {
  const { clientToken } = await params;

  const client = await db.client.findUnique({
    where: { portalToken: clientToken },
    select: {
      id: true,
      name: true,
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

  if (!client) {
    redirect("/");
  }

  // Verify session cookie
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(`portal_dashboard_${clientToken}`)?.value;

  if (!sessionToken) {
    redirect(`/portal/dashboard-login/${clientToken}`);
  }

  // Validate session in DB
  const session = await db.clientPortalSession.findUnique({
    where: { token: sessionToken },
    select: { expiresAt: true, clientId: true },
  });

  if (!session || session.clientId !== client.id || isSessionExpired(session.expiresAt)) {
    redirect(`/portal/dashboard-login/${clientToken}`);
  }

  const branding = getPortalBranding(client.organization);

  return (
    <PortalShell branding={branding} maxWidth="max-w-5xl">
      {children}
    </PortalShell>
  );
}
