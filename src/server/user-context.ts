import "server-only";
import { cache } from "react";
import { db } from "./db";

/**
 * Fetch the internal User row by Supabase UUID — deduplicated per request.
 * Both tRPC context and server-component layouts call into this; React
 * cache() collapses them into a single DB roundtrip per request.
 */
export const findDbUserBySupabaseId = cache(async (supabaseId: string) =>
  db.user.findFirst({
    where: { supabaseId },
    select: { id: true, isActive: true },
  })
);

/**
 * Resolve the user's org membership (active-org cookie with first-membership
 * fallback) — deduplicated per request. The RSC tRPC caller creates a fresh
 * context per procedure call, so a dashboard render would otherwise repeat
 * these lookups a dozen times.
 */
export const resolveMembership = cache(
  async (dbUserId: string, activeOrgId: string | null) => {
    const [activeMembership, firstMembership] = await Promise.all([
      activeOrgId
        ? db.userOrganization.findUnique({
            where: {
              userId_organizationId: {
                userId: dbUserId,
                organizationId: activeOrgId,
              },
            },
            select: { role: true, organizationId: true },
          })
        : Promise.resolve(null),
      db.userOrganization.findFirst({
        where: { userId: dbUserId },
        select: { role: true, organizationId: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return activeMembership ?? firstMembership;
  }
);
