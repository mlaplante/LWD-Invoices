import { db } from "@/server/db";
import { env } from "@/lib/env";
import { verifyPortalSession } from "@/lib/portal-session";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    select: { id: true, client: { select: { portalPassphraseHash: true } } },
  });

  if (!invoice) {
    // Don't reveal whether the token exists
    redirect("/");
  }

  // If passphrase is set, verify cookie
  const storedHash = invoice.client?.portalPassphraseHash ?? null;
  if (storedHash) {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get(`portal_auth_${token}`)?.value;

    if (!cookieVal || !verifyPortalSession(cookieVal, token, env.SUPABASE_SERVICE_ROLE_KEY)) {
      redirect(`/portal/${token}/login`);
    }
  }

  // Record first view
  await db.invoice.update({
    where: { id: invoice.id },
    data: { lastViewed: new Date() },
  }).catch(() => {
    // Non-fatal
  });

  return <>{children}</>;
}
