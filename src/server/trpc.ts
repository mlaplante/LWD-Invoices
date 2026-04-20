import { initTRPC, TRPCError } from "@trpc/server";
import { getUser } from "@/lib/supabase/server";
import { db } from "./db";
import superjson from "superjson";
import { ZodError } from "zod";
import type { UserRole } from "@/generated/prisma";
import { cookies } from "next/headers";
import { findDbUserBySupabaseId } from "./user-context";

export const createTRPCContext = async () => {
  const { data: { user } } = await getUser();
  const userId = user?.id ?? null;

  let orgId: string | null = null;
  let userRole: UserRole | null = null;
  let isActive: boolean | null = null;

  if (userId) {
    const cookieStore = await cookies();
    const activeOrgId = cookieStore.get("activeOrgId")?.value ?? null;

    const dbUser = await findDbUserBySupabaseId(userId);

    if (dbUser) {
      isActive = dbUser.isActive;

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

      if (!orgId) {
        orgId = (user?.app_metadata?.organizationId as string) ?? null;
        userRole = (user?.app_metadata?.userRole as UserRole) ?? null;
      }
    }
  }

  return { db, userId, orgId, userRole, isActive };
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
  // isActive was resolved once in createTRPCContext; no extra DB roundtrip per procedure.
  if (ctx.isActive === false) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been suspended." });
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
