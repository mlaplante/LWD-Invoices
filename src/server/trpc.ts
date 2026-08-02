import { initTRPC, TRPCError } from "@trpc/server";
import { createClient, getUser } from "@/lib/supabase/server";
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
  // The page-level middleware (src/proxy.ts) enforces MFA step-up, but it
  // whitelists /api/trpc as a "public path" and returns before that block —
  // so the entire data layer served through tRPC would otherwise be reachable
  // on an aal1 (password-only) session, defeating org 2FA. Re-check AAL here.
  // Default true so anything that isn't a 2FA-relevant authenticated session
  // is unaffected.
  let mfaSatisfied = true;

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

    // Only hit the MFA API when 2FA is actually relevant — org requires it or
    // the user has a verified factor — reading both off the user object
    // getUser() already returned, exactly as the middleware does, to avoid an
    // extra round-trip on every request.
    const orgRequire2FA = user?.app_metadata?.require2FA as boolean | undefined;
    const hasVerifiedFactor = (user?.factors ?? []).some(
      (f) => f.status === "verified",
    );
    if (orgRequire2FA || hasVerifiedFactor) {
      const supabase = await createClient();
      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      // Unsatisfied when a step-up is available but not completed this session.
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        mfaSatisfied = false;
      }
    }
  }

  return { db, userId, orgId, userRole, isActive, mfaSatisfied };
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
  // Enforce the MFA step-up the page middleware enforces for page routes. The
  // enroll/challenge flow runs client-side against Supabase directly (not
  // through tRPC), so blocking aal1 here can't lock a user out of reaching aal2.
  if (ctx.mfaSatisfied === false) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Two-factor authentication required." });
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
