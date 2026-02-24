import { db } from "@/server/db";
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
    select: { id: true, portalPassphraseHash: true },
  });

  if (!invoice) {
    // Don't reveal whether the token exists
    redirect("/");
  }

  // If passphrase is set, verify cookie
  if (invoice.portalPassphraseHash) {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get(`portal_auth_${token}`)?.value;

    if (!cookieVal || cookieVal !== invoice.portalPassphraseHash) {
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
