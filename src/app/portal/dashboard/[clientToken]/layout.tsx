import { db } from "@/server/db";
import { isSessionExpired } from "@/server/services/portal-dashboard";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

  const brandColor = client.organization.brandColor ?? "#2563eb";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header
        className="border-b"
        style={{ borderColor: `${brandColor}20` }}
      >
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-3">
          {client.organization.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.organization.logoUrl}
              alt={client.organization.name}
              className="h-8 w-auto max-w-[120px] object-contain"
            />
          )}
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground">
              {client.organization.name}
            </h1>
            <p className="text-xs text-muted-foreground">Client Portal</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
