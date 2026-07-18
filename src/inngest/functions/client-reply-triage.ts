import { inngest } from "../client";
import { db } from "@/server/db";
import { assertAiRateLimit } from "@/server/lib/ai-rate-limit";
import { classifyReply } from "@/server/services/reply-triage";
import { notifyOrgAdmins } from "@/server/services/notifications";

export const triageInboundReply = inngest.createFunction(
  { id: "triage-inbound-reply", name: "Triage inbound client reply", triggers: [{ event: "inbound-email/received" }] },
  async ({ event }) => {
    const { inboundEmailId, organizationId } = event.data as { inboundEmailId: string; organizationId: string };
    const email = await db.inboundEmail.findFirst({
      where: { id: inboundEmailId, organizationId },
      include: { triage: true, invoice: { select: { number: true, total: true, dueDate: true, status: true } } },
    });
    if (!email || email.triage) return { skipped: "already-triaged" };
    try { assertAiRateLimit("replyTriage", organizationId); } catch { return { skipped: "rate-limited" }; }
    const result = await classifyReply({ bodyText: email.bodyText ?? "", subject: email.subject, invoiceContext: email.invoice ? { number: email.invoice.number, total: Number(email.invoice.total), dueDate: email.invoice.dueDate, status: email.invoice.status } : null });
    if ("skipped" in result) return result;
    const triage = await db.inboundEmailTriage.create({ data: { inboundEmailId: email.id, organizationId, ...result } });
    if (result.source === "ai" && (result.category === "DISPUTE" || result.category === "PROMISE_TO_PAY")) {
      await notifyOrgAdmins(organizationId, { type: "TICKET_REPLIED", title: result.category === "DISPUTE" ? "Client reply: dispute raised" : "Client reply: promise to pay", body: `${email.fromEmail}${email.invoice ? ` • ${email.invoice.number}` : ""}: ${result.reasoning.split("\n")[0]}`, link: email.invoiceId ? `/invoices/${email.invoiceId}` : "/replies" }).catch(() => {});
    }
    return { id: triage.id };
  },
);
