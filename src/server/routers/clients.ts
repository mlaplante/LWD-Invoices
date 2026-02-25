import { z } from "zod";
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
});

export const clientsRouter = router({
  list: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().default(false), search: z.string().optional() }))
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
      return ctx.db.client.findUniqueOrThrow({
        where: { id: input.id, organizationId: ctx.orgId },
      });
    }),

  create: protectedProcedure
    .input(clientSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.client.create({
        data: { ...input, organizationId: ctx.orgId },
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(clientSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.client.update({
        where: { id, organizationId: ctx.orgId },
        data,
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
