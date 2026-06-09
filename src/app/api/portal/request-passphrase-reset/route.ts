import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { render } from "@react-email/render";
import PortalPassphraseResetEmail from "@/emails/PortalPassphraseResetEmail";
import { sendEmail } from "@/server/services/email-sender";
import { logAudit } from "@/server/services/audit";
import { generateSecureToken, hashToken } from "@/lib/secure-token";
import { createRateLimiter } from "@/lib/rate-limit";
import { getAppUrl } from "@/lib/app-url";

const RESET_TOKEN_TTL_MS = 60 * 60_000; // 1 hour

// One portal can only trigger a few reset emails per window, so the endpoint
// can't be used to spam the client's inbox through our sender.
const requestLimiter = createRateLimiter({ limit: 3, windowMs: 15 * 60_000 });

/**
 * Self-service "forgot passphrase" for the client portal. Accepts either a
 * client portalToken (dashboard login) or an invoice portalToken (invoice
 * login) and emails a one-hour, single-use reset link to the client's email
 * on file. Always responds with the same generic body so the endpoint can't
 * be used to probe which tokens are valid or which clients have an email.
 */
export async function POST(req: NextRequest) {
  const GENERIC_OK = NextResponse.json({
    ok: true,
    message: "If this portal has an email on file, a reset link has been sent.",
  });

  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token || token.length > 200) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (requestLimiter.isLimited(token)) {
    return NextResponse.json(
      { error: "Too many reset requests. Please try again later." },
      { status: 429 },
    );
  }

  const clientSelect = {
    id: true,
    name: true,
    email: true,
    organizationId: true,
    portalPassphraseHash: true,
  } as const;

  // The token may be a client portalToken (dashboard) or an invoice
  // portalToken (single-invoice portal) — resolve the client either way.
  let client = await db.client.findUnique({
    where: { portalToken: token },
    select: clientSelect,
  });
  if (!client) {
    const invoice = await db.invoice.findUnique({
      where: { portalToken: token },
      select: { client: { select: clientSelect } },
    });
    client = invoice?.client ?? null;
  }

  // Nothing to reset (unknown token, no passphrase configured, or no email
  // on file) — return the generic body either way.
  if (!client?.portalPassphraseHash || !client.email) {
    return GENERIC_OK;
  }

  const resetToken = generateSecureToken();
  await db.client.update({
    where: { id: client.id },
    data: {
      portalPassphraseResetTokenHash: hashToken(resetToken),
      portalPassphraseResetExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  const org = await db.organization.findUnique({
    where: { id: client.organizationId },
    select: { name: true, logoUrl: true },
  });

  const appUrl = await getAppUrl();
  const resetUrl = `${appUrl}/portal/reset-passphrase/${resetToken}`;

  const html = await render(
    PortalPassphraseResetEmail({
      resetUrl,
      orgName: org?.name ?? "your service provider",
      clientName: client.name,
      logoUrl: org?.logoUrl,
    })
  );

  await sendEmail({
    organizationId: client.organizationId,
    to: client.email,
    subject: `Reset your client portal passphrase for ${org?.name ?? "your portal"}`,
    html,
  });

  await logAudit({
    action: "UPDATED",
    entityType: "Client",
    entityId: client.id,
    entityLabel: client.name,
    diff: { event: "portal_passphrase_reset_requested" },
    userLabel: "Client portal",
    organizationId: client.organizationId,
  }).catch(() => {});

  return GENERIC_OK;
}
