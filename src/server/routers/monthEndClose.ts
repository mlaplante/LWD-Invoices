/**
 * Month-end close — the agentic capstone surface.
 *
 * The agent reconciles a period, flags anomalies, and drafts adjusting entries
 * (`preview`); the owner approves the one-click `close`, which freezes the full
 * report into a PeriodClose snapshot and locks the period. Closing is gated:
 * only an elapsed period can be closed, and blocking reconciliation errors stop
 * the close unless explicitly acknowledged (`force`). Closed periods can be
 * reopened by an owner.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import {
  buildMonthEndClose,
  lastClosedMonth,
  monthRange,
  type MonthEndCloseReport,
} from "../services/month-end-close";
import { logAudit } from "../services/audit";
import { Prisma } from "@/generated/prisma";

const periodInput = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

async function resolveUserLabel(
  db: typeof import("../db").db,
  supabaseId: string,
): Promise<string | null> {
  const user = await db.user.findFirst({
    where: { supabaseId },
    select: { email: true, firstName: true, lastName: true },
  });
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || null;
}

export const monthEndCloseRouter = router({
  /**
   * Live close report for a period (defaults to the most recently elapsed
   * month). Not persisted — this is what the agent presents for approval. Also
   * returns the existing close row, if the period was already closed.
   */
  preview: protectedProcedure
    .input(periodInput.partial().optional())
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const period =
        input?.year && input?.month
          ? { year: input.year, month: input.month }
          : lastClosedMonth(now);

      const [report, existing] = await Promise.all([
        buildMonthEndClose(ctx.db, ctx.orgId, { year: period.year, month: period.month, now }),
        ctx.db.periodClose.findUnique({
          where: {
            organizationId_periodYear_periodMonth: {
              organizationId: ctx.orgId,
              periodYear: period.year,
              periodMonth: period.month,
            },
          },
        }),
      ]);

      return { report, existing };
    }),

  /** The persisted close for a period (with its frozen snapshot), or null. */
  get: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const row = await ctx.db.periodClose.findUnique({
      where: {
        organizationId_periodYear_periodMonth: {
          organizationId: ctx.orgId,
          periodYear: input.year,
          periodMonth: input.month,
        },
      },
    });
    if (!row) return null;
    return { ...row, snapshot: row.snapshot as unknown as MonthEndCloseReport };
  }),

  /** Recent closes for the org, newest period first. */
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(120).default(24) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.periodClose.findMany({
        where: { organizationId: ctx.orgId },
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
        take: input?.limit ?? 24,
        select: {
          id: true,
          periodYear: true,
          periodMonth: true,
          status: true,
          invoiced: true,
          collected: true,
          refunded: true,
          expenses: true,
          netCash: true,
          errorCount: true,
          warningCount: true,
          adjustmentCount: true,
          closedByLabel: true,
          closedAt: true,
          reopenedAt: true,
        },
      });
    }),

  /**
   * One-click close: re-builds the report server-side (never trusting a
   * client-supplied snapshot), validates it can be closed, and freezes it.
   */
  close: requireRole("OWNER", "ADMIN")
    .input(
      periodInput.extend({
        notes: z.string().max(2000).optional(),
        /** Acknowledge and close past blocking reconciliation errors. */
        force: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const { end, label } = monthRange(input.year, input.month);

      // Only close periods that have fully elapsed — closing the current/future
      // month would freeze a snapshot that's still changing.
      if (end > now) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${label} hasn't finished yet — you can only close a completed month.`,
        });
      }

      const report = await buildMonthEndClose(ctx.db, ctx.orgId, {
        year: input.year,
        month: input.month,
        now,
      });

      if (!report.summary.canClose && !input.force) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${label} has ${report.summary.errorCount} blocking issue(s). Resolve them or close with acknowledgement.`,
        });
      }

      const label2 = await resolveUserLabel(ctx.db, ctx.userId);
      const snapshot = report as unknown as Prisma.InputJsonValue;
      const totals = {
        invoiced: new Prisma.Decimal(report.totals.invoiced),
        collected: new Prisma.Decimal(report.totals.collected),
        refunded: new Prisma.Decimal(report.totals.refunded),
        expenses: new Prisma.Decimal(report.totals.expenses),
        netCash: new Prisma.Decimal(report.totals.netCash),
      };

      const saved = await ctx.db.periodClose.upsert({
        where: {
          organizationId_periodYear_periodMonth: {
            organizationId: ctx.orgId,
            periodYear: input.year,
            periodMonth: input.month,
          },
        },
        create: {
          organizationId: ctx.orgId,
          periodYear: input.year,
          periodMonth: input.month,
          status: "CLOSED",
          ...totals,
          errorCount: report.summary.errorCount,
          warningCount: report.summary.warningCount,
          adjustmentCount: report.summary.adjustmentCount,
          snapshot,
          notes: input.notes ?? null,
          closedByUserId: ctx.userId,
          closedByLabel: label2,
          closedAt: now,
        },
        update: {
          // Re-closing a reopened period refreshes the snapshot + status.
          status: "CLOSED",
          ...totals,
          errorCount: report.summary.errorCount,
          warningCount: report.summary.warningCount,
          adjustmentCount: report.summary.adjustmentCount,
          snapshot,
          notes: input.notes ?? null,
          closedByUserId: ctx.userId,
          closedByLabel: label2,
          closedAt: now,
          reopenedAt: null,
          reopenedByUserId: null,
        },
      });

      await logAudit({
        action: "STATUS_CHANGED",
        entityType: "PeriodClose",
        entityId: saved.id,
        entityLabel: `Close — ${label}`,
        diff: {
          event: "period_closed",
          period: label,
          forced: input.force,
          errorCount: report.summary.errorCount,
          warningCount: report.summary.warningCount,
          netCash: report.totals.netCash,
        },
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});

      return { id: saved.id, status: saved.status, report };
    }),

  /** Reopen a closed period (owner only). Preserves the existing snapshot. */
  reopen: requireRole("OWNER")
    .input(periodInput)
    .mutation(async ({ ctx, input }) => {
      const { label } = monthRange(input.year, input.month);
      const existing = await ctx.db.periodClose.findUnique({
        where: {
          organizationId_periodYear_periodMonth: {
            organizationId: ctx.orgId,
            periodYear: input.year,
            periodMonth: input.month,
          },
        },
        select: { id: true, status: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: `${label} is not closed.` });
      if (existing.status === "REOPENED") return { id: existing.id, status: existing.status };

      const updated = await ctx.db.periodClose.update({
        where: { id: existing.id },
        data: { status: "REOPENED", reopenedByUserId: ctx.userId, reopenedAt: new Date() },
        select: { id: true, status: true },
      });

      await logAudit({
        action: "STATUS_CHANGED",
        entityType: "PeriodClose",
        entityId: updated.id,
        entityLabel: `Close — ${label}`,
        diff: { event: "period_reopened", period: label },
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});

      return { id: updated.id, status: updated.status };
    }),
});
