import { inngest } from "../client";
import { db } from "@/server/db";
import { sendEmail } from "@/server/services/email-sender";

/**
 * Decides whether a "viewed but not signed" nudge is due for a proposal.
 *
 * Mirrors the invoice VIEWED_UNPAID trigger: engagement (the proposal email was
 * opened) is a stronger buying signal than a calendar offset, so the nudge
 * anchors to the first open. Fires once the delay window has elapsed and no
 * nudge has been sent yet. Returns false when the proposal was never opened.
 */
export function isProposalNudgeDue(
  now: Date,
  firstOpenedAt: Date | null | undefined,
  delayHours: number,
  alreadyNudged: boolean,
): boolean {
  if (alreadyNudged) return false;
  if (!firstOpenedAt) return false;
  const elapsedHours = (now.getTime() - firstOpenedAt.getTime()) / 3_600_000;
  return elapsedHours >= delayHours;
}

export const processProposalNudges = inngest.createFunction(
  { id: "process-proposal-nudges", name: "Process Proposal Nudges", triggers: [{ cron: "0 9 * * *" }] }, // daily at 9am UTC
  async () => {
    const now = new Date();

    // 1. Orgs that have the proposal nudge enabled, keyed by their delay.
    const orgs = await db.organization.findMany({
      where: { proposalNudgeEnabled: true },
      select: { id: true, proposalNudgeDelayHours: true },
    });
    if (!orgs.length) return { processed: 0, sent: 0, skipped: 0, failed: 0 };

    const orgDelay = new Map(orgs.map((o) => [o.id, o.proposalNudgeDelayHours]));
    const orgIds = orgs.map((o) => o.id);

    // 2. Sent, unsigned estimates that have a proposal not yet nudged.
    //    SENT (not ACCEPTED/REJECTED) + signedAt null = still awaiting a decision.
    const estimates = await db.invoice.findMany({
      where: {
        organizationId: { in: orgIds },
        type: "ESTIMATE",
        status: "SENT",
        signedAt: null,
        isArchived: false,
        proposalContent: { is: { nudgeSentAt: null } },
      },
      include: {
        client: { select: { name: true, email: true } },
        organization: { select: { name: true, logoUrl: true, brandColor: true, hidePoweredBy: true } },
        currency: { select: { symbol: true } },
        proposalContent: { select: { id: true } },
      },
    });
    if (!estimates.length) return { processed: 0, sent: 0, skipped: 0, failed: 0 };

    // 3. Earliest "opened" event per estimate — the anchor for the nudge.
    const estimateIds = estimates.map((e) => e.id);
    const openEvents = await db.emailEvent.groupBy({
      by: ["invoiceId"],
      where: { invoiceId: { in: estimateIds }, type: "email.opened" },
      _min: { occurredAt: true },
    });
    const firstOpenMap = new Map<string, Date>();
    for (const e of openEvents) {
      if (e.invoiceId && e._min.occurredAt) firstOpenMap.set(e.invoiceId, e._min.occurredAt);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const estimate of estimates) {
      const delayHours = orgDelay.get(estimate.organizationId) ?? 48;
      const firstOpenedAt = firstOpenMap.get(estimate.id);

      if (
        !estimate.client.email ||
        !estimate.proposalContent ||
        !isProposalNudgeDue(now, firstOpenedAt, delayHours, false)
      ) {
        skipped++;
        continue;
      }

      try {
        const { render } = await import("@react-email/render");
        const { ProposalViewedNudgeEmail } = await import("@/emails/ProposalViewedNudgeEmail");

        const html = await render(
          ProposalViewedNudgeEmail({
            invoiceNumber: estimate.number,
            clientName: estimate.client.name,
            orgName: estimate.organization.name,
            portalLink: `${appUrl}/portal/${estimate.portalToken}`,
            total: estimate.total.toFixed(2),
            currencySymbol: estimate.currency.symbol,
            logoUrl: estimate.organization.logoUrl ?? undefined,
            brandColor: estimate.organization.brandColor ?? undefined,
            hidePoweredBy: estimate.organization.hidePoweredBy,
          }),
        );

        await sendEmail({
          organizationId: estimate.organizationId,
          invoiceId: estimate.id,
          to: estimate.client.email,
          subject: `Following up on Proposal #${estimate.number} from ${estimate.organization.name}`,
          html,
        });

        // Mark nudged so we only ever send one nudge per proposal.
        await db.proposalContent.update({
          where: { id: estimate.proposalContent.id },
          data: { nudgeSentAt: now },
        });

        sent++;
      } catch (err) {
        console.error(`[proposal-nudges] Failed to nudge estimate ${estimate.number}:`, err);
        failed++;
      }
    }

    return { processed: estimates.length, sent, skipped, failed };
  },
);
