import { z } from "zod";
import { cookies } from "next/headers";
import { Prisma } from "@/generated/prisma";
import bcrypt from "bcryptjs";
import { router, protectedProcedure, requireRole } from "../trpc";
import { logAudit } from "../services/audit";
import { getForOrg } from "../lib/get-for-org";
import { idInput, paginationInput } from "../lib/schemas";
import { generatePortalToken } from "@/lib/portal-session";
import { generateSessionToken } from "../services/portal-dashboard";

// Admin portal previews use a short-lived session — long enough to look
// around, short enough that a forgotten tab doesn't stay signed in.
const PORTAL_PREVIEW_SESSION_MS = 60 * 60_000;
import { getClientCreditStatus } from "../services/credit-hold";
import { buildClientHealthInputForClient } from "../services/analytics-data";
import { calculateClientHealthScore } from "../services/client-health-score";

const clientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  // Capped at 10 so a malicious admin can't fan out one invoice send into
  // a mass-mail; matches MAX_CC_RECIPIENTS in cc-emails.ts.
  ccEmails: z.array(z.string().email()).max(10).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  // Format validation is intentionally lenient — country-specific tax-ID
  // formats vary widely (VAT, EIN, ABN, GSTIN, ...) and a country-aware
  // validator would be a bigger feature. Strip whitespace and cap length
  // so callers can't paste 10MB of garbage.
  taxId: z.string().trim().max(64).optional(),
  isTaxExempt: z.boolean().optional(),
  notes: z.string().optional(),
  // Minimum 8 chars makes brute-force impractical given the rate-limit + lockout
  // on /api/portal/dashboard/[clientToken]/auth (10 attempts / 15 min,
  // 5-failure lockout). Max guards against accidental megabyte pastes.
  portalPassphrase: z.string().min(8).max(255).optional(),
  defaultPaymentTermsDays: z.number().int().min(0).max(365).nullable().optional(),
});

async function hashPassphraseIfProvided(
  input: { portalPassphrase?: string },
): Promise<{ portalPassphraseHash?: string }> {
  if (!input.portalPassphrase) return {};
  const hash = await bcrypt.hash(input.portalPassphrase, 12);
  return { portalPassphraseHash: hash };
}

export const clientsRouter = router({
  list: protectedProcedure
    .input(
      paginationInput.extend({
        includeArchived: z.boolean().default(false),
        search: z.string().max(100).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.ClientWhereInput = {
        organizationId: ctx.orgId,
        ...(input.includeArchived ? {} : { isArchived: false }),
        ...(input.search
          ? {
              OR: [
                { name: { contains: input.search, mode: "insensitive" as const } },
                { email: { contains: input.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };

      const [items, total] = await ctx.db.$transaction([
        ctx.db.client.findMany({
          where,
          orderBy: { name: "asc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        ctx.db.client.count({ where }),
      ]);

      return { items, total };
    }),

  get: protectedProcedure
    .input(idInput)
    .query(async ({ ctx, input }) => {
      return getForOrg(ctx.db.client, input.id, ctx.orgId, { entityName: "Client" });
    }),

  // Combined reminder history across all of a client's invoices: ad-hoc manual
  // sends (InvoiceReminder) + automated sequence sends (ReminderLog), newest
  // first, each linked to its invoice.
  reminderHistory: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      await getForOrg(ctx.db.client, input.clientId, ctx.orgId, { entityName: "Client" });

      const [manual, sequence] = await Promise.all([
        ctx.db.invoiceReminder.findMany({
          where: { organizationId: ctx.orgId, invoice: { clientId: input.clientId } },
          select: {
            id: true,
            sentAt: true,
            subject: true,
            tone: true,
            source: true,
            invoice: { select: { id: true, number: true } },
          },
        }),
        ctx.db.reminderLog.findMany({
          where: { invoice: { clientId: input.clientId, organizationId: ctx.orgId } },
          select: {
            id: true,
            sentAt: true,
            invoice: { select: { id: true, number: true } },
            step: { select: { subject: true, sequence: { select: { name: true } } } },
          },
        }),
      ]);

      const entries = [
        ...manual.map((m) => ({
          id: m.id,
          kind: "manual" as const,
          sentAt: m.sentAt,
          subject: m.subject,
          tone: m.tone,
          source: m.source,
          sequenceName: null as string | null,
          invoiceId: m.invoice.id,
          invoiceNumber: m.invoice.number,
        })),
        ...sequence.map((s) => ({
          id: s.id,
          kind: "sequence" as const,
          sentAt: s.sentAt,
          subject: s.step.subject,
          tone: null as string | null,
          source: null as string | null,
          sequenceName: s.step.sequence.name,
          invoiceId: s.invoice.id,
          invoiceNumber: s.invoice.number,
        })),
      ].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());

      return entries;
    }),

  // Most recent reminder sent to a client across any of its invoices (manual or
  // sequence). Lightweight — powers the "last reminded" chip on the header.
  lastReminded: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [manual, sequence] = await Promise.all([
        ctx.db.invoiceReminder.findFirst({
          where: { organizationId: ctx.orgId, invoice: { clientId: input.clientId } },
          orderBy: { sentAt: "desc" },
          select: { sentAt: true },
        }),
        ctx.db.reminderLog.findFirst({
          where: { invoice: { clientId: input.clientId, organizationId: ctx.orgId } },
          orderBy: { sentAt: "desc" },
          select: { sentAt: true },
        }),
      ]);
      const times = [manual?.sentAt, sequence?.sentAt].filter((d): d is Date => d != null);
      const lastRemindedAt = times.length > 0 ? new Date(Math.max(...times.map((d) => d.getTime()))) : null;
      return { lastRemindedAt };
    }),

  create: requireRole("OWNER", "ADMIN")
    .input(clientSchema)
    .mutation(async ({ ctx, input }) => {
      const { portalPassphrase, ...rest } = input;
      const passHash = await hashPassphraseIfProvided({ portalPassphrase });
      const result = await ctx.db.client.create({
        data: {
          ...rest,
          ...passHash,
          organizationId: ctx.orgId,
          // Override schema's @default(cuid()) with crypto-strong randomness.
          portalToken: generatePortalToken(),
        },
      });
      await logAudit({
        action: "CREATED",
        entityType: "Client",
        entityId: result.id,
        entityLabel: result.name,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      });
      return result;
    }),

  update: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string(), removePassphrase: z.boolean().optional() }).merge(clientSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, portalPassphrase, removePassphrase, ...rest } = input;
      const passHash = removePassphrase
        ? { portalPassphraseHash: null }
        : await hashPassphraseIfProvided({ portalPassphrase });
      const result = await ctx.db.client.update({
        where: { id, organizationId: ctx.orgId },
        data: { ...rest, ...passHash },
      });
      await logAudit({
        action: "UPDATED",
        entityType: "Client",
        entityId: result.id,
        entityLabel: result.name,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      });
      return result;
    }),

  archive: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string(), isArchived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.client.update({
        where: { id: input.id, organizationId: ctx.orgId },
        data: { isArchived: input.isArchived },
      });
      await logAudit({
        action: "UPDATED",
        entityType: "Client",
        entityId: result.id,
        entityLabel: `${result.name} ${input.isArchived ? "archived" : "unarchived"}`,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      });
      return result;
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.client.delete({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      await logAudit({
        action: "DELETED",
        entityType: "Client",
        entityId: result.id,
        entityLabel: result.name,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      });
      return result;
    }),

  toggleAutoCharge: requireRole("OWNER", "ADMIN")
    .input(z.object({ clientId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.client.update({
        where: { id: input.clientId, organizationId: ctx.orgId },
        data: { autoChargeEnabled: input.enabled },
      });
    }),

  // ─── Credit limit / credit hold ─────────────────────────────────────────────

  // Read model for the client's credit section: open AR exposure vs. limit,
  // hold status, auto-hold policy, and the current health score. Powers the
  // warning banner shown before sending invoices / charging cards.
  creditStatus: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const built = await buildClientHealthInputForClient(ctx.db, ctx.orgId, input.clientId, now);
      const healthScore = built ? calculateClientHealthScore(built).score : null;
      return getClientCreditStatus(ctx.db, ctx.orgId, input.clientId, healthScore);
    }),

  // Set the credit policy: hard limit on open AR + whether/when to auto-hold
  // based on the health score.
  setCreditPolicy: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        clientId: z.string(),
        creditLimit: z.number().min(0).nullable().optional(),
        autoCreditHoldEnabled: z.boolean().optional(),
        autoCreditHoldThreshold: z.number().int().min(0).max(100).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { clientId, ...rest } = input;
      const result = await ctx.db.client.update({
        where: { id: clientId, organizationId: ctx.orgId },
        data: rest,
      });
      await logAudit({
        action: "UPDATED",
        entityType: "Client",
        entityId: result.id,
        entityLabel: `${result.name} — credit policy`,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return result;
    }),

  // Manually place or release a credit hold. A manual hold clears the auto flag
  // so the daily evaluator won't release it on a score recovery.
  setCreditHold: requireRole("OWNER", "ADMIN")
    .input(z.object({ clientId: z.string(), hold: z.boolean(), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.client.update({
        where: { id: input.clientId, organizationId: ctx.orgId },
        data: input.hold
          ? {
              creditHold: true,
              creditHoldAuto: false,
              creditHoldReason: input.reason ?? "Manual credit hold.",
              creditHoldSetAt: new Date(),
            }
          : {
              creditHold: false,
              creditHoldAuto: false,
              creditHoldReason: null,
              creditHoldSetAt: null,
            },
      });
      await logAudit({
        action: "UPDATED",
        entityType: "Client",
        entityId: result.id,
        entityLabel: `${result.name} — credit hold ${input.hold ? "placed" : "released"}`,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return result;
    }),

  // "View as client": issues the admin a real (short-lived) portal dashboard
  // session for this client, so staff can see exactly what the client sees
  // without knowing the client's passphrase — including after the client has
  // changed it via the self-service reset. Audited per use.
  previewPortal: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const client = await getForOrg(ctx.db.client, input.id, ctx.orgId, {
        select: { id: true, name: true, portalToken: true },
        entityName: "Client",
      });

      const sessionToken = generateSessionToken();
      await ctx.db.clientPortalSession.create({
        data: {
          token: sessionToken,
          expiresAt: new Date(Date.now() + PORTAL_PREVIEW_SESSION_MS),
          clientId: client.id,
          userAgent: "admin-preview",
        },
      });

      const cookieStore = await cookies();
      cookieStore.set(`portal_dashboard_${client.portalToken}`, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: Math.floor(PORTAL_PREVIEW_SESSION_MS / 1000),
        path: `/portal/dashboard/${client.portalToken}`,
      });

      await logAudit({
        action: "VIEWED",
        entityType: "Client.Portal",
        entityId: client.id,
        entityLabel: client.name,
        diff: { event: "portal_admin_preview" },
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});

      return { url: `/portal/dashboard/${client.portalToken}` };
    }),
});
