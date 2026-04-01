import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const searchRouter = router({
  global: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(100) }))
    .query(async ({ ctx, input }) => {
      const q = input.query;
      const take = 5;

      const [invoices, clients, projects, expenses, tickets] = await Promise.all([
        ctx.db.invoice.findMany({
          where: {
            organizationId: ctx.orgId,
            isArchived: false,
            OR: [
              { number: { contains: q, mode: "insensitive" } },
              { client: { name: { contains: q, mode: "insensitive" } } },
            ],
          },
          select: {
            id: true,
            number: true,
            status: true,
            total: true,
            client: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take,
        }),
        ctx.db.client.findMany({
          where: {
            organizationId: ctx.orgId,
            isArchived: false,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true, email: true },
          orderBy: { createdAt: "desc" },
          take,
        }),
        ctx.db.project.findMany({
          where: {
            organizationId: ctx.orgId,
            isArchived: false,
            name: { contains: q, mode: "insensitive" },
          },
          select: { id: true, name: true, status: true },
          orderBy: { createdAt: "desc" },
          take,
        }),
        ctx.db.expense.findMany({
          where: {
            organizationId: ctx.orgId,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { supplier: { name: { contains: q, mode: "insensitive" } } },
            ],
          },
          select: {
            id: true,
            name: true,
            rate: true,
            qty: true,
            supplier: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take,
        }),
        ctx.db.ticket.findMany({
          where: {
            organizationId: ctx.orgId,
            subject: { contains: q, mode: "insensitive" },
          },
          select: { id: true, number: true, subject: true, status: true },
          orderBy: { createdAt: "desc" },
          take,
        }),
      ]);

      return { invoices, clients, projects, expenses, tickets };
    }),
});
