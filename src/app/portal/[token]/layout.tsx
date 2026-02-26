import { db } from "@/server/db";
import { env } from "@/lib/env";
import { verifyPortalSession } from "@/lib/portal-session";
import { notifyOrgAdmins } from "@/server/services/notifications";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Resend } from "resend";

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
    select: {
      id: true,
      number: true,
      lastViewed: true,
      organizationId: true,
      total: true,
      currency: {
        select: { symbol: true },
      },
      client: {
        select: {
          name: true,
          portalPassphraseHash: true,
        },
      },
      organization: {
        select: {
          name: true,
          users: {
            where: { role: "ADMIN" },
            select: { email: true },
          },
        },
      },
    },
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

  const isFirstView = !invoice.lastViewed;
  const viewedAt = new Date();

  // Record view timestamp
  await db.invoice.update({
    where: { id: invoice.id },
    data: { lastViewed: viewedAt },
  }).catch(() => {
    // Non-fatal
  });

  // Send notifications on first view only
  if (isFirstView) {
    const invoiceLink = `${env.NEXT_PUBLIC_APP_URL}/invoices/${invoice.id}`;
    const clientName = invoice.client?.name ?? "Your client";
    const orgName = invoice.organization.name;
    const viewedAtFormatted = viewedAt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    // In-app notification
    notifyOrgAdmins(invoice.organizationId, {
      type: "INVOICE_VIEWED",
      title: "Invoice viewed",
      body: `${clientName} viewed Invoice #${invoice.number}`,
      link: invoiceLink,
    }).catch(() => {
      // Non-fatal
    });

    // Email notification to org admins
    const adminEmails = invoice.organization.users
      .map((u) => u.email)
      .filter(Boolean) as string[];

    if (adminEmails.length > 0) {
      const { render } = await import("@react-email/render");
      const { InvoiceViewedEmail } = await import("@/emails/InvoiceViewedEmail");
      const resend = new Resend(env.RESEND_API_KEY);
      const html = await render(
        InvoiceViewedEmail({
          invoiceNumber: invoice.number,
          clientName,
          orgName,
          invoiceLink,
          viewedAt: viewedAtFormatted,
          total: Number(invoice.total).toFixed(2),
          currencySymbol: invoice.currency.symbol,
        })
      );
      resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: adminEmails,
        subject: `${clientName} viewed Invoice #${invoice.number}`,
        html,
      }).catch(() => {
        // Non-fatal
      });
    }
  }

  return <>{children}</>;
}
