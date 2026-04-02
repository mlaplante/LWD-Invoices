import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { TicketStatus, TicketPriority } from "@/generated/prisma";

export const ticketsRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.nativeEnum(TicketStatus).optional(),
      clientId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.ticket.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.status ? { status: input.status } : {}),
          ...(input.clientId ? { clientId: input.clientId } : {}),
        },
        include: { client: true, messages: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const ticket = await ctx.db.ticket.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        include: { client: true, messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });
      return ticket;
    }),

  create: requireRole("OWNER", "ADMIN")
    .input(z.object({
      subject: z.string().min(1),
      body: z.string().min(1),
      priority: z.nativeEnum(TicketPriority).default(TicketPriority.NORMAL),
      clientId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const lastTicket = await ctx.db.ticket.findFirst({
        where: { organizationId: ctx.orgId },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      const number = (lastTicket?.number ?? 0) + 1;

      try {
        return await ctx.db.ticket.create({
          data: {
            number,
            subject: input.subject,
            priority: input.priority,
            clientId: input.clientId,
            organizationId: ctx.orgId,
            messages: {
              create: {
                body: input.body,
                isStaff: true,
                authorId: ctx.userId,
              },
            },
          },
          include: { messages: true },
        });
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2002") {
          throw new TRPCError({ code: "CONFLICT", message: "Ticket number conflict, please retry." });
        }
        throw e;
      }
    }),

  reply: requireRole("OWNER", "ADMIN")
    .input(z.object({ ticketId: z.string(), body: z.string().min(1), isStaff: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const ticket = await ctx.db.ticket.findFirst({
        where: { id: input.ticketId, organizationId: ctx.orgId },
      });
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.ticketMessage.create({
        data: {
          ticketId: input.ticketId,
          body: input.body,
          isStaff: input.isStaff,
          authorId: ctx.userId,
        },
      });
    }),

  updateStatus: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string(), status: z.nativeEnum(TicketStatus) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.ticket.updateMany({
        where: { id: input.id, organizationId: ctx.orgId },
        data: { status: input.status },
      });
      if (result.count === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { success: true };
    }),
});
