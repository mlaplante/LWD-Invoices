import { db } from "../db";
import {
  ClientCheckInTouchType,
  ClientCheckInStatus,
  Prisma,
} from "@/generated/prisma";

const DAY_MS = 86_400_000;

export interface CheckInCounts {
  projectClose: number;
  thirtyDay: number;
  quarterly: number;
  annual: number;
}

export const emptyCounts = (): CheckInCounts => ({
  projectClose: 0,
  thirtyDay: 0,
  quarterly: 0,
  annual: 0,
});

/**
 * Create a PROJECT_CLOSE check-in for a project that just transitioned to
 * COMPLETED. Idempotent: returns existing row if already queued.
 *
 * Caller is responsible for checking the org's retention feature flag —
 * this function does not gate on it so it can be reused from tests/seeds.
 */
export async function generateProjectCloseCheckIn(params: {
  organizationId: string;
  clientId: string;
  projectId: string;
  now?: Date;
  tx?: Prisma.TransactionClient;
}) {
  const now = params.now ?? new Date();
  const client = params.tx ?? db;
  const existing = await client.clientCheckIn.findFirst({
    where: {
      organizationId: params.organizationId,
      clientId: params.clientId,
      projectId: params.projectId,
      touchType: ClientCheckInTouchType.PROJECT_CLOSE,
    },
  });
  if (existing) return existing;

  return client.clientCheckIn.create({
    data: {
      organizationId: params.organizationId,
      clientId: params.clientId,
      projectId: params.projectId,
      touchType: ClientCheckInTouchType.PROJECT_CLOSE,
      dueAt: now,
    },
  });
}

/**
 * Generate cron-driven check-ins for one org. Honors `retentionEnabledAt` as
 * the "fire forward only" cutoff: projects/clients with no activity since
 * the cutoff are skipped so newly-enabled orgs aren't flooded with backlog.
 */
export async function generateDueCheckInsForOrg(params: {
  organizationId: string;
  retentionEnabledAt: Date;
  now?: Date;
}): Promise<CheckInCounts> {
  const now = params.now ?? new Date();
  const counts = emptyCounts();

  // ── 30-day post-completion: projects that completed 28-35 days ago ──────
  const thirtyDayWindowEnd = new Date(now.getTime() - 28 * DAY_MS);
  const thirtyDayWindowStart = new Date(now.getTime() - 35 * DAY_MS);
  const cutoff =
    params.retentionEnabledAt.getTime() > thirtyDayWindowStart.getTime()
      ? params.retentionEnabledAt
      : thirtyDayWindowStart;

  const recentlyCompleted = await db.project.findMany({
    where: {
      organizationId: params.organizationId,
      status: "COMPLETED",
      updatedAt: { gte: cutoff, lte: thirtyDayWindowEnd },
    },
    select: { id: true, clientId: true, updatedAt: true },
  });

  counts.thirtyDay = await bulkUpsertProjectCheckIns({
    organizationId: params.organizationId,
    touchType: ClientCheckInTouchType.THIRTY_DAY,
    projects: recentlyCompleted,
    dueAt: now,
  });

  // ── Quarterly: clients with last touch > 90d ago, capped one per client ─
  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY_MS);

  const candidateClients = await db.client.findMany({
    where: {
      organizationId: params.organizationId,
      isArchived: false,
      // Must have had at least one project completed since the feature was
      // enabled — otherwise they're not really a "past client" yet.
      projects: {
        some: {
          status: "COMPLETED",
          updatedAt: { gte: params.retentionEnabledAt },
        },
      },
    },
    select: {
      id: true,
      checkIns: {
        where: { touchType: ClientCheckInTouchType.QUARTERLY },
        orderBy: { dueAt: "desc" },
        take: 1,
        select: { dueAt: true, status: true },
      },
    },
  });

  const quarterlyDue = candidateClients.filter((client) => {
    const last = client.checkIns[0];
    if (last) {
      // Skip if there's an open one already or the last one was < 90d ago.
      if (last.status === ClientCheckInStatus.PENDING) return false;
      if (last.dueAt.getTime() > ninetyDaysAgo.getTime()) return false;
    }
    return true;
  });
  if (quarterlyDue.length > 0) {
    await db.clientCheckIn.createMany({
      data: quarterlyDue.map((client) => ({
        organizationId: params.organizationId,
        clientId: client.id,
        touchType: ClientCheckInTouchType.QUARTERLY,
        dueAt: now,
      })),
    });
  }
  counts.quarterly = quarterlyDue.length;

  // ── Annual: project anniversaries (within ±7d window) ──────────────────
  const yearStart = new Date(now.getTime() - (365 + 7) * DAY_MS);
  const yearEnd = new Date(now.getTime() - (365 - 7) * DAY_MS);
  const annualCutoff =
    params.retentionEnabledAt.getTime() > yearStart.getTime() ? params.retentionEnabledAt : yearStart;

  const anniversaryProjects = await db.project.findMany({
    where: {
      organizationId: params.organizationId,
      status: "COMPLETED",
      updatedAt: { gte: annualCutoff, lte: yearEnd },
    },
    select: { id: true, clientId: true },
  });

  counts.annual = await bulkUpsertProjectCheckIns({
    organizationId: params.organizationId,
    touchType: ClientCheckInTouchType.ANNUAL,
    projects: anniversaryProjects,
    dueAt: now,
  });

  return counts;
}

/**
 * Idempotent bulk insert of one check-in per project: one findMany to learn
 * which projects already have a check-in of this touch type, one createMany
 * for the rest — instead of a find + create pair per project.
 */
async function bulkUpsertProjectCheckIns(params: {
  organizationId: string;
  touchType: ClientCheckInTouchType;
  projects: { id: string; clientId: string }[];
  dueAt: Date;
}): Promise<number> {
  if (params.projects.length === 0) return 0;

  const existing = await db.clientCheckIn.findMany({
    where: {
      organizationId: params.organizationId,
      touchType: params.touchType,
      projectId: { in: params.projects.map((p) => p.id) },
    },
    select: { projectId: true },
  });
  const alreadyQueued = new Set(existing.map((c) => c.projectId));
  const fresh = params.projects.filter((p) => !alreadyQueued.has(p.id));
  if (fresh.length === 0) return 0;

  await db.clientCheckIn.createMany({
    data: fresh.map((p) => ({
      organizationId: params.organizationId,
      clientId: p.clientId,
      projectId: p.id,
      touchType: params.touchType,
      dueAt: params.dueAt,
    })),
  });
  return fresh.length;
}

export function totalNewCheckIns(counts: CheckInCounts): number {
  return counts.projectClose + counts.thirtyDay + counts.quarterly + counts.annual;
}
