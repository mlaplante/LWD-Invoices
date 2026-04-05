import { initTRPC, TRPCError } from "@trpc/server";
import { getUser } from "@/lib/supabase/server";
import { db } from "./db";
import superjson from "superjson";
import { ZodError } from "zod";
import type { UserRole } from "@/generated/prisma";
import { cookies } from "next/headers";

export const createTRPCContext = async () => {
  const { data: { user } } = await getUser();
  const userId = user?.id ?? null;

  let orgId: string | null = null;
  let userRole: UserRole | null = null;

  if (userId) {
    // Read active org from cookie
    const cookieStore = await cookies();
    const activeOrgId = cookieStore.get("activeOrgId")?.value ?? null;

    // Look up our internal User record (userId in context is Supabase UUID, User table has supabaseId)
    const dbUser = await db.user.findFirst({
      where: { supabaseId: userId },
      select: { id: true },
    });

    if (dbUser) {
      if (activeOrgId) {
        const membership = await db.userOrganization.findUnique({
          where: { userId_organizationId: { userId: dbUser.id, organizationId: activeOrgId } },
          select: { role: true, organizationId: true },
        });
        if (membership) {
          orgId = membership.organizationId;
          userRole = membership.role;
        }
      }

      // Fallback: if no cookie or invalid, use first membership
      if (!orgId) {
        const firstMembership = await db.userOrganization.findFirst({
          where: { userId: dbUser.id },
          select: { role: true, organizationId: true },
          orderBy: { createdAt: "asc" },
        });
        if (firstMembership) {
          orgId = firstMembership.organizationId;
          userRole = firstMembership.role;
        }
      }

      // Legacy fallback: if UserOrganization is empty (migration not yet run),
      // fall back to app_metadata
      if (!orgId) {
        orgId = (user?.app_metadata?.organizationId as string) ?? null;
        userRole = (user?.app_metadata?.userRole as UserRole) ?? null;
      }
    }
  }

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
  try {
    const dbUser = await ctx.db.user.findFirst({
      where: { supabaseId: ctx.userId },
      select: { isActive: true },
    });
    if (dbUser && !dbUser.isActive) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been suspended." });
    }
  } catch (e) {
    if (e instanceof TRPCError) throw e;
  }

  return next({ ctx: { ...ctx, userId: ctx.userId, orgId: ctx.orgId, userRole: ctx.userRole } });
});

export const requireRole = (...allowed: UserRole[]) =>
  protectedProcedure.use(({ ctx, next }) => {
    if (!ctx.userRole || !allowed.includes(ctx.userRole)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
    }
    return next({ ctx });
  });
