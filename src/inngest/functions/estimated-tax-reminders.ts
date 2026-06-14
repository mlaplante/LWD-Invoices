import { inngest } from "../client";
import { db } from "@/server/db";
import { sendEmail } from "@/server/services/email-sender";
import {
  getEstimatedTaxSummary,
  usEstimatedTaxQuarters,
  estimatedTaxReminderDue,
} from "@/server/services/estimated-tax";

/** UTC-stable money + date formatting so quarter boundaries don't shift by TZ. */
function fmtMoney(symbol: string, n: number): string {
  return `${symbol}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDueDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const MS_PER_DAY = 86_400_000;

/**
 * Daily sweep that emails org admins ahead of each federal estimated-tax
 * deadline. A reminder fires once when "today" enters the window
 * [dueDate − reminderDays, dueDate]; `estimatedTaxReminderLastSentAt` dedupes
 * repeat sends within the same window. Quarters from both the current and prior
 * tax year are considered so the January (Q4) deadline is covered.
 */
export const processEstimatedTaxReminders = inngest.createFunction(
  {
    id: "process-estimated-tax-reminders",
    name: "Process Estimated Tax Reminders",
    triggers: [{ cron: "0 14 * * *" }], // Daily 14:00 UTC
  },
  async () => {
    const now = new Date();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.example.com";

    const orgs = await db.organization.findMany({
      where: { estimatedTaxEnabled: true },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        brandColor: true,
        hidePoweredBy: true,
        estimatedTaxSetAsidePercent: true,
        estimatedTaxReminderDays: true,
        estimatedTaxReminderLastSentAt: true,
        currencies: { where: { isDefault: true }, select: { symbol: true } },
      },
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const org of orgs) {
      // Deadlines from this and last tax year (covers the January Q4 deadline).
      const candidates = [
        ...usEstimatedTaxQuarters(now.getUTCFullYear() - 1),
        ...usEstimatedTaxQuarters(now.getUTCFullYear()),
      ];

      const hit = estimatedTaxReminderDue({
        now,
        dueDates: candidates.map((c) => c.dueDate),
        reminderDays: org.estimatedTaxReminderDays,
        lastSentAt: org.estimatedTaxReminderLastSentAt,
      });
      if (!hit) {
        skipped++;
        continue;
      }

      try {
        const cand = candidates.find((c) => c.dueDate.getTime() === hit.dueDate.getTime())!;
        // Q4's payment is due in January of the following calendar year.
        const taxYear = cand.quarter === 4 ? cand.dueDate.getUTCFullYear() - 1 : cand.dueDate.getUTCFullYear();

        const members = await db.userOrganization.findMany({
          where: { organizationId: org.id, role: { in: ["OWNER", "ADMIN"] } },
          select: { user: { select: { email: true } } },
        });
        const recipients = Array.from(
          new Set(
            members
              .map((m) => m.user.email?.trim().toLowerCase())
              .filter((e): e is string => !!e),
          ),
        );
        if (recipients.length === 0) {
          skipped++;
          continue;
        }

        const summary = await getEstimatedTaxSummary(db, org.id, {
          year: taxYear,
          setAsidePercent: Number(org.estimatedTaxSetAsidePercent),
          now,
        });
        const quarter = summary.quarters.find((q) => q.quarter === cand.quarter)!;
        const symbol = org.currencies[0]?.symbol ?? "$";
        const daysUntil = Math.max(0, Math.ceil((cand.dueDate.getTime() - now.getTime()) / MS_PER_DAY));

        const { render } = await import("@react-email/render");
        const { EstimatedTaxReminderEmail } = await import("@/emails/EstimatedTaxReminderEmail");
        const html = await render(
          EstimatedTaxReminderEmail({
            orgName: org.name,
            logoUrl: org.logoUrl ?? undefined,
            brandColor: org.brandColor ?? undefined,
            hidePoweredBy: org.hidePoweredBy,
            periodLabel: quarter.label,
            dueDateLabel: fmtDueDate(cand.dueDate),
            daysUntil,
            recommendedSetAside: fmtMoney(symbol, quarter.recommendedSetAside),
            netIncome: fmtMoney(symbol, quarter.netIncome),
            reportLink: `${appUrl}/reports/estimated-tax?year=${taxYear}`,
          }),
        );

        await sendEmail({
          organizationId: org.id,
          to: recipients,
          subject: `Estimated tax for ${quarter.label} — due ${fmtDueDate(cand.dueDate)}`,
          html,
        });

        await db.organization.update({
          where: { id: org.id },
          data: { estimatedTaxReminderLastSentAt: now },
        });
        sent++;
      } catch (err) {
        console.error(`[estimated-tax-reminders] Failed for org ${org.id}:`, err);
        failed++;
      }
    }

    return { processed: orgs.length, sent, skipped, failed };
  },
);
