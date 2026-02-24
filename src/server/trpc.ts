import { initTRPC, TRPCError } from "@trpc/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "./db";
import superjson from "superjson";
import { ZodError } from "zod";

export const createTRPCContext = async () => {
  const { userId, orgId } = await auth();
  return { db, userId, orgId };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId || !ctx.orgId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const orgId = ctx.orgId;

  // Ensure the organization exists in the DB (in case the webhook hasn't fired yet)
  const exists = await ctx.db.organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  });
  if (!exists) {
    const clerk = await clerkClient();
    const clerkOrg = await clerk.organizations.getOrganization({ organizationId: orgId });
    await ctx.db.organization.create({
      data: { id: orgId, name: clerkOrg.name, slug: clerkOrg.slug ?? undefined },
    });
  }

  return next({ ctx: { ...ctx, userId: ctx.userId, orgId } });
});
