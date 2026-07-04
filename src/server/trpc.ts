import { initTRPC, TRPCError } from "@trpc/server";
import { getUser } from "@/lib/supabase/server";
import { db } from "./db";
import superjson from "@/lib/superjson";
import { ZodError } from "zod";
import type { UserRole } from "@/generated/prisma";
import { cookies } from "next/headers";
import { findDbUserBySupabaseId, resolveMembership } from "./user-context";

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

      // UserOrganization is the sole source of truth for org access. The old
      // app_metadata fallback let users removed from an org (membership row
      // deleted) keep full access via stale Supabase metadata.
      const membership = await resolveMembership(dbUser.id, activeOrgId);
      if (membership) {
        orgId = membership.organizationId;
        userRole = membership.role;
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
