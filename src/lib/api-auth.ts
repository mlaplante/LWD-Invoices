import { getUser } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { cookies } from "next/headers";

export type AuthResult =
  | { user: { id: string }; orgId: string }
  | Response;

/**
 * Authenticates the current request and extracts the organizationId.
 * Uses the same org-resolution logic as the tRPC context:
 *   1. activeOrgId cookie  +  UserOrganization membership
 *   2. First membership fallback
 *   3. Legacy app_metadata fallback
 * Returns a Response(401) if unauthorized, otherwise returns { user, orgId }.
 */
export async function getAuthenticatedOrg(): Promise<AuthResult> {
  const { data: { user } } = await getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let orgId: string | null = null;

  const dbUser = await db.user.findFirst({
    where: { supabaseId: user.id },
    select: { id: true },
  });

  if (dbUser) {
    const cookieStore = await cookies();
    const activeOrgId = cookieStore.get("activeOrgId")?.value ?? null;

    if (activeOrgId) {
      const membership = await db.userOrganization.findUnique({
        where: { userId_organizationId: { userId: dbUser.id, organizationId: activeOrgId } },
        select: { organizationId: true },
      });
      if (membership) {
        orgId = membership.organizationId;
      }
    }

    // Fallback: first membership
    if (!orgId) {
      const firstMembership = await db.userOrganization.findFirst({
        where: { userId: dbUser.id },
        select: { organizationId: true },
        orderBy: { createdAt: "asc" },
      });
      if (firstMembership) {
        orgId = firstMembership.organizationId;
      }
    }
  }

  // Legacy fallback: app_metadata
  if (!orgId) {
    orgId = (user.app_metadata?.organizationId as string) ?? null;
  }

  if (!orgId) {
    return new Response("Unauthorized", { status: 401 });
  }

  return { user: { id: user.id }, orgId };
}

/** Type guard: true if the result is an auth failure Response */
export function isAuthError(result: AuthResult): result is Response {
  return result instanceof Response;
}
