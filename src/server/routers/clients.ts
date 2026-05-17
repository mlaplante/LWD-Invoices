import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import bcrypt from "bcryptjs";
import { router, protectedProcedure, requireRole } from "../trpc";
import { logAudit } from "../services/audit";
import { getForOrg } from "../lib/get-for-org";
import { generatePortalToken } from "@/lib/portal-session";

const clientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
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
      z.object({
        includeArchived: z.boolean().default(false),
        search: z.string().max(100).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
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
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return getForOrg(ctx.db.client, input.id, ctx.orgId, { entityName: "Client" });
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
    .input(z.object({ id: z.string() }))
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
});
