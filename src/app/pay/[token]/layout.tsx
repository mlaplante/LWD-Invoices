import { db } from "@/server/db";
import { getPortalSessionSecret, verifyPortalSession } from "@/lib/portal-session";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

/**
 * Passphrase gate for the public pay pages. Mirrors the portal layout: the
 * /pay/[token] tree is a separate route tree from /portal/[token] and had no
 * layout, so a client that set a portal passphrase was still fully readable
 * here (saved-card state, payment-method identifiers) with only the bare link.
 *
 * If the client set a passphrase, require the same portal_auth_<token> session
 * cookie. No passphrase → the link is the credential (unchanged behaviour).
 */
export default async function PayLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    select: { client: { select: { portalPassphraseHash: true } } },
  });

  const storedHash = invoice?.client?.portalPassphraseHash ?? null;
  if (storedHash) {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get(`portal_auth_${token}`)?.value;
    if (!cookieVal || !verifyPortalSession(cookieVal, token, getPortalSessionSecret())) {
      redirect(`/portal/portal-login/${token}`);
    }
  }

  return <>{children}</>;
}
