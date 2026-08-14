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
 * Pick the effective membership from a user's memberships, ordered createdAt asc.
 *
 * Selection rule (unchanged from the two-query version this replaced): prefer the
 * membership matching the active-org cookie; if the cookie is absent, or names an
 * org the user is not actually a member of, fall back to their earliest membership.
 * That fallback is what makes a stale cookie harmless — it can never widen access,
 * because a non-matching cookie is simply ignored rather than trusted.
 *
 * Extracted and exported purely so the selection can be unit-tested without a
 * database; `resolveMembership` is the only production caller.
 */
export function pickMembership<T extends { organizationId: string }>(
  rows: readonly T[],
  activeOrgId: string | null
): T | null {
  if (activeOrgId) {
    const active = rows.find((r) => r.organizationId === activeOrgId);
    if (active) return active;
  }
  return rows[0] ?? null;
}

/**
 * Resolve the user's org membership (active-org cookie with first-membership
 * fallback) — deduplicated per request. The RSC tRPC caller creates a fresh
 * context per procedure call, so a dashboard render would otherwise repeat
 * these lookups a dozen times.
 *
 * One query, not two. This previously issued a findUnique for the cookie's org
 * alongside a findFirst for the fallback, wrapped in Promise.all. In production
 * the Prisma pool is capped at max:1 (see server/db.ts), so those two queries
 * serialized rather than overlapping — Promise.all bought nothing and the request
 * paid two round trips. A user belongs to a handful of orgs, so fetching all their
 * memberships and choosing in JS is one round trip for the same answer. The
 * `@@unique([userId, organizationId])` index leads on userId, so this is still an
 * index read, not a scan.
 */
export const resolveMembership = cache(
  async (dbUserId: string, activeOrgId: string | null) => {
    const memberships = await db.userOrganization.findMany({
      where: { userId: dbUserId },
      select: { role: true, organizationId: true },
      orderBy: { createdAt: "asc" },
    });
    return pickMembership(memberships, activeOrgId);
  }
);
