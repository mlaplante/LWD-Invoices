import { z } from "zod";
import { cookies } from "next/headers";
import { Prisma } from "@/generated/prisma";
import bcrypt from "bcryptjs";
import { router, protectedProcedure, requireRole } from "../trpc";
import { logAudit } from "../services/audit";
import { getForOrg } from "../lib/get-for-org";
import { idInput, paginationInput } from "../lib/schemas";
import { generatePortalToken } from "@/lib/portal-session";
import {
  createDashboardSession,
  dashboardSessionCookieName,
  dashboardSessionCookieOptions,
} from "../services/portal-dashboard";

// Admin portal previews use a short-lived session — long enough to look
// around, short enough that a forgotten tab doesn't stay signed in.
const PORTAL_PREVIEW_SESSION_MS = 60 * 60_000;
import { getClientCreditStatus } from "../services/credit-hold";
import { EmailPreferenceKind } from "@/generated/prisma";
import {
  EMAIL_PREFERENCE_KINDS,
  buildEmailPreferencesUrl,
  resolvePreferenceState,
  setEmailPreference,
} from "../services/email-preferences";
import {
  MAX_TAGS_PER_CLIENT,
  MAX_TAG_LENGTH,
  normalizeTags,
  parseClientsCsv,
} from "../services/client-csv";
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
  // Normalized via normalizeTags() before persisting (trim, dedupe, caps).
  tags: z.array(z.string().trim().min(1).max(MAX_TAG_LENGTH)).max(MAX_TAGS_PER_CLIENT).optional(),
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
  // Cost 13: existing cost-12 hashes still verify (bcrypt stores the cost in
  // the hash), so this is a forward-only strengthening with no migration.
  const hash = await bcrypt.hash(input.portalPassphrase, 13);
  return { portalPassphraseHash: hash };
}

export const clientsRouter = router({
  list: protectedProcedure
    .input(
      paginationInput.extend({
        includeArchived: z.boolean().default(false),
        search: z.string().max(100).optional(),
        tag: z.string().max(MAX_TAG_LENGTH).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.ClientWhereInput = {
        organizationId: ctx.orgId,
        ...(input.includeArchived ? {} : { isArchived: false }),
        ...(input.tag ? { tags: { has: input.tag } } : {}),
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
          // Explicit allowlist: this list is fetched by any authenticated org
          // member (bare protectedProcedure), so secret/token fields
          // (portalPassphraseHash, portalPassphraseResetTokenHash,
          // portalToken, emailPreferencesToken) must never appear here even
          // though they exist on the Client model. Only include what the
          // list UI actually renders/consumes.
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            city: true,
            country: true,
            tags: true,
            defaultPaymentTermsDays: true,
          },
        }),
        ctx.db.client.count({ where }),
      ]);

      return { items, total };
    }),

  get: protectedProcedure
    .input(idInput)
    .query(async ({ ctx, input }) => {
      const client = await getForOrg(ctx.db.client, input.id, ctx.orgId, { entityName: "Client" });
      // Never let secret token/hash fields leave the server for this
      // non-privileged read path. `hasPortalPassphrase` preserves the one
      // bit of signal the detail-view edit form needs (whether a passphrase
      // is currently set) without exposing the crackable bcrypt hash itself.
      const {
        portalPassphraseHash,
        portalPassphraseResetTokenHash,
        portalPassphraseResetExpiresAt,
        emailPreferencesToken,
        ...rest
      } = client;
      return { ...rest, hasPortalPassphrase: portalPassphraseHash != null };
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
      if (rest.tags) rest.tags = normalizeTags(rest.tags);
      const result = await ctx.db.client.create({
        data: {
          ...rest,
          ...passHash,
          organizationId: ctx.orgId,
          // Override schema's @default(cuid()) with crypto-strong randomness.
          portalToken: generatePortalToken(),
          emailPreferencesToken: generatePortalToken(),
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
      if (rest.tags) rest.tags = normalizeTags(rest.tags);
      // Changing or removing the passphrase must invalidate any live portal
      // sessions — otherwise an admin rotating a compromised passphrase leaves
      // a stolen 30-day session cookie working. Mirrors the self-service reset
      // route (api/portal/reset-passphrase). `passHash` is a non-empty object
      // only when the passphrase actually changed.
      const passphraseChanged = "portalPassphraseHash" in passHash;
      const result = await ctx.db.client.update({
        where: { id, organizationId: ctx.orgId },
        data: { ...rest, ...passHash },
      });
      if (passphraseChanged) {
        await ctx.db.clientPortalSession.deleteMany({ where: { clientId: result.id } });
      }
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

  // ─── Tags & CSV import ───────────────────────────────────────────────────────

  // Distinct tags in use across the org's active clients, with counts —
  // powers the tag filter on the clients list and tag suggestions in the form.
  usedTags: protectedProcedure.query(async ({ ctx }) => {
    const clients = await ctx.db.client.findMany({
      where: { organizationId: ctx.orgId, isArchived: false, tags: { isEmpty: false } },
      select: { tags: true },
      take: 5000,
    });
    const counts = new Map<string, { tag: string; count: number }>();
    for (const { tags } of clients) {
      for (const tag of tags) {
        const key = tag.toLowerCase();
        const entry = counts.get(key);
        if (entry) entry.count++;
        else counts.set(key, { tag, count: 1 });
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }),

  // Bulk import from CSV. Parsing happens server-side (client-csv.ts) so the
  // same validation applies regardless of caller. Rows whose email already
  // exists in the org are skipped rather than duplicated; rows without an
  // email are deduped by exact name match.
  importCsv: requireRole("OWNER", "ADMIN")
    .input(z.object({ csv: z.string().min(1).max(1_000_000) }))
    .mutation(async ({ ctx, input }) => {
      const { rows, errors } = parseClientsCsv(input.csv);
      if (rows.length === 0) {
        return { created: 0, skipped: 0, errors };
      }

      const existing = await ctx.db.client.findMany({
        where: { organizationId: ctx.orgId },
        select: { name: true, email: true },
      });
      const existingEmails = new Set(
        existing.map((c) => c.email?.toLowerCase()).filter(Boolean) as string[],
      );
      const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));

      let created = 0;
      let skipped = 0;
      for (const row of rows) {
        const duplicate = row.email
          ? existingEmails.has(row.email.toLowerCase())
          : existingNames.has(row.name.toLowerCase());
        if (duplicate) {
          skipped++;
          continue;
        }
        await ctx.db.client.create({
          data: {
            name: row.name,
            email: row.email,
            phone: row.phone,
            address: row.address,
            city: row.city,
            state: row.state,
            zip: row.zip,
            country: row.country,
            taxId: row.taxId,
            notes: row.notes,
            tags: row.tags,
            defaultPaymentTermsDays: row.defaultPaymentTermsDays,
            organizationId: ctx.orgId,
            portalToken: generatePortalToken(),
            emailPreferencesToken: generatePortalToken(),
          },
        });
        if (row.email) existingEmails.add(row.email.toLowerCase());
        existingNames.add(row.name.toLowerCase());
        created++;
      }

      await logAudit({
        action: "CREATED",
        entityType: "Client",
        entityId: "csv-import",
        entityLabel: `CSV import — ${created} created, ${skipped} skipped`,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});

      return { created, skipped, errors };
    }),

  // ─── Email preferences (CAN-SPAM / GDPR opt-outs) ───────────────────────────

  // Read model for the client's email-preference card: per-kind toggles plus
  // the public manage-preferences URL (so admins can resend it on request).
  emailPreferences: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const client = await getForOrg(ctx.db.client, input.clientId, ctx.orgId, {
        select: { id: true, emailPreferencesToken: true },
        entityName: "Client",
      });
      const rows = await ctx.db.clientEmailPreference.findMany({
        where: { clientId: client.id, organizationId: ctx.orgId },
        select: { kind: true, enabled: true },
      });
      return {
        kinds: EMAIL_PREFERENCE_KINDS,
        preferences: resolvePreferenceState(rows),
        manageUrl: buildEmailPreferencesUrl(client.emailPreferencesToken),
      };
    }),

  // Admin override for a single kind — e.g. honoring a verbal "stop emailing
  // me reminders" without making the client click the footer link. Audited.
  setEmailPreference: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        clientId: z.string(),
        kind: z.nativeEnum(EmailPreferenceKind),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const client = await getForOrg(ctx.db.client, input.clientId, ctx.orgId, {
        select: { id: true, name: true },
        entityName: "Client",
      });
      await setEmailPreference({
        clientId: client.id,
        organizationId: ctx.orgId,
        kind: input.kind,
        enabled: input.enabled,
      });
      await logAudit({
        action: "UPDATED",
        entityType: "Client",
        entityId: client.id,
        entityLabel: `${client.name} — ${input.kind} emails ${input.enabled ? "enabled" : "disabled"}`,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return { ok: true };
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

      const { sessionToken } = await createDashboardSession(ctx.db, {
        clientId: client.id,
        durationMs: PORTAL_PREVIEW_SESSION_MS,
        userAgent: "admin-preview",
      });

      const cookieStore = await cookies();
      cookieStore.set(
        dashboardSessionCookieName(client.portalToken),
        sessionToken,
        dashboardSessionCookieOptions(Math.floor(PORTAL_PREVIEW_SESSION_MS / 1000)),
      );

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
