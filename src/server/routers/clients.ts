import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { router, protectedProcedure } from "../trpc";

const clientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  taxId: z.string().optional(),
  notes: z.string().optional(),
  portalPassphrase: z.string().optional(),
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
    .input(z.object({ includeArchived: z.boolean().default(false), search: z.string().max(100).optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.client.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.includeArchived ? {} : { isArchived: false }),
          ...(input.search
            ? {
                OR: [
                  { name: { contains: input.search, mode: "insensitive" } },
                  { email: { contains: input.search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { name: "asc" },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const client = await ctx.db.client.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!client) throw new TRPCError({ code: "NOT_FOUND" });
      return client;
    }),

  create: protectedProcedure
    .input(clientSchema)
    .mutation(async ({ ctx, input }) => {
      const { portalPassphrase, ...rest } = input;
      const passHash = await hashPassphraseIfProvided({ portalPassphrase });
      return ctx.db.client.create({
        data: { ...rest, ...passHash, organizationId: ctx.orgId },
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(clientSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, portalPassphrase, ...rest } = input;
      const passHash = await hashPassphraseIfProvided({ portalPassphrase });
      return ctx.db.client.update({
        where: { id, organizationId: ctx.orgId },
        data: { ...rest, ...passHash },
      });
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string(), isArchived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.client.update({
        where: { id: input.id, organizationId: ctx.orgId },
        data: { isArchived: input.isArchived },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.client.delete({
        where: { id: input.id, organizationId: ctx.orgId },
      });
    }),
});
