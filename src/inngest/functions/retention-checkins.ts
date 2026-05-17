import { inngest } from "../client";
import { db } from "@/server/db";
import { createNotification } from "@/server/services/notifications";
import {
  generateDueCheckInsForOrg,
  totalNewCheckIns,
  type CheckInCounts,
} from "@/server/services/check-in-generator";
import { ClientCheckInStatus } from "@/generated/prisma";

export function buildDigestBody(counts: CheckInCounts, openCount: number): string {
  const lines: string[] = [];
  const newTotal = totalNewCheckIns(counts);
  if (newTotal > 0) {
    lines.push(`${newTotal} new check-in${newTotal === 1 ? "" : "s"} surfaced:`);
    if (counts.thirtyDay) lines.push(`  • ${counts.thirtyDay} 30-day follow-up${counts.thirtyDay === 1 ? "" : "s"}`);
    if (counts.quarterly) lines.push(`  • ${counts.quarterly} quarterly check-in${counts.quarterly === 1 ? "" : "s"}`);
    if (counts.annual) lines.push(`  • ${counts.annual} annual revisit${counts.annual === 1 ? "" : "s"}`);
    if (counts.projectClose) lines.push(`  • ${counts.projectClose} project close`);
  } else {
    lines.push("No new check-ins surfaced this week.");
  }
  lines.push("");
  lines.push(`${openCount} pending in queue.`);
  return lines.join("\n");
}

export const processRetentionCheckIns = inngest.createFunction(
  {
    id: "process-retention-checkins",
    name: "Process Retention Check-Ins",
    triggers: [{ cron: "0 13 * * 1" }], // Mondays 13:00 UTC
  },
  async () => {
    const now = new Date();

    const orgs = await db.organization.findMany({
      where: { retentionEnabled: true, retentionEnabledAt: { not: null } },
      select: {
        id: true,
        retentionEnabledAt: true,
        members: {
          where: { role: { in: ["OWNER", "ADMIN"] } },
          include: { user: { select: { id: true, supabaseId: true } } },
        },
      },
    });

    // Run orgs concurrently with a small concurrency cap so a 500-org cron
    // completes in seconds instead of minutes. Each org does an INSERT-many
    // and a COUNT against the same DB, so we don't want unbounded parallelism
    // hammering the connection pool — 10 in-flight at a time hits a sweet
    // spot for Supabase pooler defaults.
    const CONCURRENCY = 10;
    let totalNew = 0;
    let totalNotified = 0;
    const failures: string[] = [];

    async function processOrg(org: (typeof orgs)[number]): Promise<void> {
      if (!org.retentionEnabledAt) return;
      try {
        const counts = await generateDueCheckInsForOrg({
          organizationId: org.id,
          retentionEnabledAt: org.retentionEnabledAt,
          now,
        });
        const newTotal = totalNewCheckIns(counts);
        totalNew += newTotal;

        const openCount = await db.clientCheckIn.count({
          where: { organizationId: org.id, status: ClientCheckInStatus.PENDING },
        });

        // Only ping admins when something new landed or queue isn't empty.
        if (newTotal === 0 && openCount === 0) return;

        const title =
          newTotal > 0
            ? `${newTotal} new client check-in${newTotal === 1 ? "" : "s"}`
            : "Client retention queue ready for review";
        const body = buildDigestBody(counts, openCount);

        await Promise.all(
          org.members.map((m) =>
            createNotification({
              type: "RETENTION_QUEUE_READY",
              title,
              body,
              link: "/clients/retention",
              userId: m.user.supabaseId ?? m.user.id,
              organizationId: org.id,
            }),
          ),
        );
        totalNotified += org.members.length;
      } catch (err) {
        console.error(`[retention-checkins] org ${org.id} failed:`, err);
        failures.push(org.id);
      }
    }

    for (let i = 0; i < orgs.length; i += CONCURRENCY) {
      const batch = orgs.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(processOrg));
    }

    return {
      orgs: orgs.length,
      newCheckIns: totalNew,
      adminsNotified: totalNotified,
      failures,
    };
  },
);
