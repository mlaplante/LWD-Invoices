import { inngest } from "../client";
import { db } from "@/server/db";
import { getOwnerBcc } from "@/server/services/email-bcc";
import { generateReportHtml } from "@/server/services/report-pdf-generator";

/**
 * Checks if a scheduled report is due today.
 */
export function isDueToday(
  now: Date,
  frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY",
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  lastSentAt: Date | null
): boolean {
  if (frequency === "WEEKLY") {
    if (dayOfWeek === null) return false;
    if (now.getUTCDay() !== dayOfWeek) return false;
    if (lastSentAt) {
      const daysSince = Math.floor((now.getTime() - lastSentAt.getTime()) / 86400000);
      if (daysSince < 6) return false;
    }
    return true;
  }
  if (frequency === "MONTHLY") {
    if (dayOfMonth === null) return false;
    if (now.getUTCDate() !== dayOfMonth) return false;
    if (lastSentAt) {
      const daysSince = Math.floor((now.getTime() - lastSentAt.getTime()) / 86400000);
      if (daysSince < 25) return false;
    }
    return true;
  }
  if (frequency === "QUARTERLY") {
    if (dayOfMonth === null) return false;
    if (now.getUTCDate() !== dayOfMonth) return false;
    const quarterMonths = [0, 3, 6, 9];
    if (!quarterMonths.includes(now.getUTCMonth())) return false;
    if (lastSentAt) {
      const daysSince = Math.floor((now.getTime() - lastSentAt.getTime()) / 86400000);
      if (daysSince < 80) return false;
    }
    return true;
  }
  return false;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  PROFIT_LOSS: "Profit & Loss",
  AGING: "Invoice Aging",
  UNPAID: "Unpaid Invoices",
  EXPENSES: "Expenses",
  TAX_LIABILITY: "Tax Liability",
};

export const processScheduledReports = inngest.createFunction(
  { id: "process-scheduled-reports", name: "Process Scheduled Reports" },
  { cron: "0 7 * * *" }, // daily at 7am UTC
  async () => {
    const now = new Date();

    const schedules = await db.scheduledReport.findMany({
      where: { enabled: true },
      include: { organization: { select: { name: true } } },
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const schedule of schedules) {
      if (!isDueToday(now, schedule.frequency, schedule.dayOfWeek, schedule.dayOfMonth, schedule.lastSentAt)) {
        skipped++;
        continue;
      }

      try {
        const reportData = await generateReportHtml(schedule.organizationId, schedule.reportType);

        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);

        const bcc = await getOwnerBcc(schedule.organizationId);

        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "reports@example.com",
          to: schedule.recipients,
          subject: `${REPORT_TYPE_LABELS[schedule.reportType] ?? schedule.reportType} Report - ${schedule.organization.name}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
              ${reportData.html}
              <hr style="margin-top: 30px; border: none; border-top: 1px solid #e5e7eb;" />
              <p style="color: #6b7280; font-size: 12px; margin-top: 10px;">
                This is an automated report from ${schedule.organization.name}.
                Manage your scheduled reports in Settings &gt; Reports.
              </p>
            </div>
          `,
          ...(bcc ? { bcc } : {}),
        });

        await db.scheduledReport.update({
          where: { id: schedule.id },
          data: { lastSentAt: now },
        });

        sent++;
      } catch (err) {
        console.error(`[scheduled-reports] Failed to send ${schedule.reportType} for org ${schedule.organizationId}:`, err);
        failed++;
      }
    }

    return { processed: schedules.length, sent, skipped, failed };
  }
);
