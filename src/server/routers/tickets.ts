import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { idInput } from "../lib/schemas";
import { TicketStatus, TicketPriority } from "@/generated/prisma";
import { assertInOrg } from "../lib/get-for-org";
import { logAudit } from "../services/audit";

export const ticketsRouter = router({
  // Cursor-paginated ticket list. The list view never renders message bodies,
  // so we no longer pull the full `messages` history per ticket (that lives on
  // the detail `get`); only `client` (name) is needed for the row. Summary tiles
  // come from `summary` below so they stay correct across pages.
  list: protectedProcedure
    .input(z.object({
      status: z.nativeEnum(TicketStatus).optional(),
      clientId: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.ticket.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.status ? { status: input.status } : {}),
          ...(input.clientId ? { clientId: input.clientId } : {}),
        },
        include: { client: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        nextCursor = items.pop()!.id; // the extra row marks "there's more"
      }
      return { items, nextCursor };
    }),

  // Org-wide ticket counts for the summary tiles — counted in the DB so they
  // stay accurate regardless of how many list pages have been loaded.
  summary: protectedProcedure.query(async ({ ctx }) => {
    const [total, open, urgent] = await Promise.all([
      ctx.db.ticket.count({ where: { organizationId: ctx.orgId } }),
      ctx.db.ticket.count({ where: { organizationId: ctx.orgId, status: TicketStatus.OPEN } }),
      ctx.db.ticket.count({ where: { organizationId: ctx.orgId, priority: TicketPriority.URGENT } }),
    ]);
    return { total, open, urgent };
  }),

  get: protectedProcedure
    .input(idInput)
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
      if (input.clientId) {
        await assertInOrg(ctx.db.client, input.clientId, ctx.orgId, { entityName: "Client" });
      }

      const lastTicket = await ctx.db.ticket.findFirst({
        where: { organizationId: ctx.orgId },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      const number = (lastTicket?.number ?? 0) + 1;

      let created: { id: string; number: number; subject: string };
      try {
        created = await ctx.db.ticket.create({
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

      await logAudit({
        action: "CREATED",
        entityType: "Ticket",
        entityId: created.id,
        entityLabel: `#${created.number} ${created.subject}`,
        userId: ctx.userId ?? undefined,
        organizationId: ctx.orgId,
      }).catch(() => {});

      return created;
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
      await logAudit({
        action: "STATUS_CHANGED",
        entityType: "Ticket",
        entityId: input.id,
        entityLabel: input.status,
        userId: ctx.userId ?? undefined,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return { success: true };
    }),
});
