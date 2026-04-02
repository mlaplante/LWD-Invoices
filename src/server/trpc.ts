import { initTRPC, TRPCError } from "@trpc/server";
import { getUser } from "@/lib/supabase/server";
import { db } from "./db";
import superjson from "superjson";
import { ZodError } from "zod";
import type { UserRole } from "@/generated/prisma";

export const createTRPCContext = async () => {
  const { data: { user } } = await getUser();

  const userId = user?.id ?? null;
  const orgId = (user?.app_metadata?.organizationId as string) ?? null;

  // Read role from app_metadata (set during onboarding/invitation acceptance)
  const userRole = (user?.app_metadata?.userRole as UserRole) ?? null;

  return { db, userId, orgId, userRole };
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

  // Check if user account is suspended
  const user = await ctx.db.user.findFirst({
    where: { supabaseId: ctx.userId, organizationId: ctx.orgId },
    select: { isActive: true },
  });
  if (user && !user.isActive) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been suspended. Contact your administrator." });
  }

  const orgId = ctx.orgId;
  return next({ ctx: { ...ctx, userId: ctx.userId, orgId, userRole: ctx.userRole } });
});

export const requireRole = (...allowed: UserRole[]) =>
  protectedProcedure.use(({ ctx, next }) => {
    if (!ctx.userRole || !allowed.includes(ctx.userRole)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
    }
    return next({ ctx });
  });
