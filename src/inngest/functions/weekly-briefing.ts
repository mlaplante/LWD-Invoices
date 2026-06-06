import { inngest } from "../client";
import { db } from "@/server/db";
import { sendEmail } from "@/server/services/email-sender";
import {
  buildWeeklyBriefing,
  resolveBriefingRecipients,
} from "@/server/services/weekly-briefing";
import { format } from "date-fns";

/**
 * Guard against a double-send when the cron is replayed or runs more than once
 * in a week: skip an org whose briefing already went out in the last 6 days.
 */
export function briefingDueForOrg(now: Date, lastSentAt: Date | null): boolean {
  if (!lastSentAt) return true;
  const daysSince = Math.floor((now.getTime() - lastSentAt.getTime()) / 86_400_000);
  return daysSince >= 6;
}

export const processWeeklyBriefing = inngest.createFunction(
  { id: "process-weekly-briefing", name: "Process Weekly Briefing", triggers: [{ cron: "0 13 * * 1" }] }, // Mondays 13:00 UTC
  async () => {
    const now = new Date();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.example.com";

    const orgs = await db.organization.findMany({
      where: { weeklyBriefingEnabled: true },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        brandColor: true,
        hidePoweredBy: true,
        weeklyBriefingRecipients: true,
        weeklyBriefingLastSentAt: true,
      },
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const org of orgs) {
      if (!briefingDueForOrg(now, org.weeklyBriefingLastSentAt)) {
        skipped++;
        continue;
      }

      try {
        const recipients = await resolveBriefingRecipients(
          db,
          org.id,
          org.weeklyBriefingRecipients,
        );
        if (recipients.length === 0) {
          skipped++;
          continue;
        }

        const data = await buildWeeklyBriefing(db, org.id, now);

        const { render } = await import("@react-email/render");
        const { WeeklyBriefingEmail } = await import("@/emails/WeeklyBriefingEmail");
        const html = await render(
          WeeklyBriefingEmail({
            orgName: data.orgName,
            logoUrl: org.logoUrl ?? undefined,
            brandColor: org.brandColor ?? undefined,
            hidePoweredBy: org.hidePoweredBy,
            appUrl,
            currencySymbol: data.currencySymbol,
            headline: data.headline,
            overdue: data.overdue,
            atRiskClients: data.atRiskClients,
            forecast: data.forecast,
            collections: data.collections,
            periodLabel: `Week of ${format(now, "MMM d, yyyy")}`,
          }),
        );

        await sendEmail({
          organizationId: org.id,
          to: recipients,
          subject: `Your weekly briefing — ${data.headline}`,
          html,
        });

        await db.organization.update({
          where: { id: org.id },
          data: { weeklyBriefingLastSentAt: now },
        });
        sent++;
      } catch (err) {
        console.error(`[weekly-briefing] Failed for org ${org.id}:`, err);
        failed++;
      }
    }

    return { processed: orgs.length, sent, skipped, failed };
  },
);
