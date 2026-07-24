import { NextResponse, type NextRequest } from "next/server";
import { Webhook } from "svix";
import { db } from "@/server/db";
import { inngest } from "@/inngest/client";
import {
  parseInboundPayload,
  extractInvoiceIdFromRecipients,
} from "@/server/services/inbound-email";

/**
 * Extract the bare address from a From header value, which may already be a
 * bare address ("client@acme.com") or a display-name form
 * ("Name <client@acme.com>") depending on how the provider formats it.
 * Returns null for an empty/missing value.
 */
function normalizeSenderEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const angleMatch = trimmed.match(/<([^>]+)>\s*$/);
  const bare = (angleMatch ? angleMatch[1] : trimmed).trim().toLowerCase();
  return bare || null;
}

/**
 * Inbound email webhook. Client replies to invoice emails (Reply-To
 * reply+<invoiceId>@<inbound-domain>) are posted here. We verify the Svix
 * signature, resolve the invoice from the recipient address, record the reply
 * as an InboundEmail, and thread it onto a support ticket (reusing the invoice's
 * existing thread or opening a new one) so the conversation lives in one place.
 *
 * The Svix signature only proves the payload came from Resend — it does not
 * prove the email's From header is genuine (Resend does not authenticate
 * arbitrary inbound mail). Before attributing the message to the client we
 * additionally verify the sender's address matches the invoice's client
 * email; an unverified sender is still recorded as an InboundEmail audit row
 * but is never threaded onto the ticket or used to trigger notifications.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Inbound webhook not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let payload: unknown;
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(rawBody, headers);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const parsed = parseInboundPayload(payload);
  const invoiceId = extractInvoiceIdFromRecipients(parsed.toAddresses);
  if (!invoiceId) {
    // Can't attribute the reply to an invoice — acknowledge so the provider
    // doesn't retry, but there's nothing to thread.
    return NextResponse.json({ ok: true, threaded: false });
  }

  // De-dupe replays by provider message id.
  if (parsed.messageId) {
    const existing = await db.inboundEmail.findFirst({
      where: { messageId: parsed.messageId },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ ok: true, duplicate: true });
  }

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      number: true,
      organizationId: true,
      clientId: true,
      client: { select: { email: true } },
    },
  });
  if (!invoice) {
    return NextResponse.json({ ok: true, threaded: false });
  }

  // The From header is fully attacker-controlled content of an inbound
  // message; only treat the sender as the invoice's client if it matches the
  // client's known email (case-insensitive, trimmed). Fail closed if either
  // side is missing.
  const senderEmail = normalizeSenderEmail(parsed.fromEmail);
  const clientEmail = invoice.client?.email?.trim().toLowerCase() || null;
  const senderVerified = !!senderEmail && !!clientEmail && senderEmail === clientEmail;

  const messageBody =
    parsed.bodyText?.trim() ||
    parsed.subject?.trim() ||
    "(empty reply)";

  let ticketId: string | null = null;

  if (senderVerified) {
    // Thread onto a ticket: reuse the invoice's existing inbound thread if one
    // exists, otherwise open a new ticket for the client.
    const priorThread = await db.inboundEmail.findFirst({
      where: { invoiceId: invoice.id, ticketId: { not: null } },
      orderBy: { receivedAt: "desc" },
      select: { ticketId: true },
    });
    ticketId = priorThread?.ticketId ?? null;

    try {
      if (ticketId) {
        await db.ticketMessage.create({
          data: {
            ticketId,
            body: messageBody,
            isStaff: false,
            authorName: parsed.fromEmail,
          },
        });
        await db.ticket.update({ where: { id: ticketId }, data: { status: "OPEN" } });
      } else {
        const last = await db.ticket.findFirst({
          where: { organizationId: invoice.organizationId },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        const ticket = await db.ticket.create({
          data: {
            number: (last?.number ?? 0) + 1,
            subject: parsed.subject?.trim() || `Reply re: invoice #${invoice.number}`,
            status: "OPEN",
            organizationId: invoice.organizationId,
            clientId: invoice.clientId,
            messages: {
              create: {
                body: messageBody,
                isStaff: false,
                authorName: parsed.fromEmail,
              },
            },
          },
          select: { id: true },
        });
        ticketId = ticket.id;
      }
    } catch (err) {
      // Threading is best-effort; we still record the InboundEmail below so the
      // reply is never lost. A ticket-number race just means no ticket this time.
      console.error("[inbound-email] Failed to thread onto ticket:", err);
      ticketId = null;
    }
  } else {
    console.warn(
      "[inbound-email] Sender does not match invoice client; recording audit row without threading",
      { invoiceId: invoice.id },
    );
  }

  const inboundEmail = await db.inboundEmail.create({
    data: {
      organizationId: invoice.organizationId,
      invoiceId: invoice.id,
      clientId: invoice.clientId,
      ticketId,
      fromEmail: parsed.fromEmail || "unknown",
      subject: parsed.subject,
      bodyText: parsed.bodyText,
      messageId: parsed.messageId,
      inReplyTo: parsed.inReplyTo,
    },
  });

  if (senderVerified) {
    await inngest.send({
      name: "inbound-email/received",
      data: { inboundEmailId: inboundEmail.id, organizationId: invoice.organizationId },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, threaded: ticketId != null });
}
