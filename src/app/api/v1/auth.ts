import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/server/db";
import { paginationFromRequest } from "@/lib/pagination";
import { createRateLimiter } from "@/lib/rate-limit";

export interface V1Context {
  orgId: string;
  userId: string;
}

// 60 requests per token per minute, per process instance. For cross-replica
// enforcement this would need the Upstash limiter (src/lib/rate-limiter.ts).
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export function clearRateLimits() {
  limiter.clear();
}

export function isRateLimited(token: string): boolean {
  return limiter.isLimited(token);
}

export async function withV1Auth(
  req: NextRequest,
  handler: (ctx: V1Context) => Promise<NextResponse>,
): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);

  if (isRateLimited(token)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Validate token via Supabase admin client
  const admin = createAdminClient();
  const { data: { user }, error } = await admin.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // UserOrganization is the sole source of truth for org access — same rule
  // as the tRPC context (src/server/trpc.ts). Resolving the org from
  // app_metadata would let users removed from an org keep API access via
  // stale Supabase metadata, and would skip the isActive suspension check.
  const dbUser = await db.user.findFirst({
    where: { supabaseId: user.id },
    select: { id: true, isActive: true },
  });

  if (!dbUser) {
    return NextResponse.json({ error: "No organization context" }, { status: 401 });
  }
  if (dbUser.isActive === false) {
    return NextResponse.json(
      { error: "Your account has been suspended" },
      { status: 403 },
    );
  }

  // Multi-org callers can pin the target org via header; it must be one of
  // their memberships. Otherwise fall back to the first membership.
  const requestedOrgId = req.headers.get("x-organization-id");

  let orgId: string | null = null;
  if (requestedOrgId) {
    const membership = await db.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId: dbUser.id,
          organizationId: requestedOrgId,
        },
      },
      select: { organizationId: true },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of the requested organization" },
        { status: 403 },
      );
    }
    orgId = membership.organizationId;
  } else {
    const firstMembership = await db.userOrganization.findFirst({
      where: { userId: dbUser.id },
      select: { organizationId: true },
      orderBy: { createdAt: "asc" },
    });
    orgId = firstMembership?.organizationId ?? null;
  }

  if (!orgId) {
    return NextResponse.json({ error: "No organization context" }, { status: 401 });
  }

  return handler({ orgId, userId: user.id });
}

export function paginationParams(req: NextRequest) {
  const { skip, take, page } = paginationFromRequest(req);
  return { skip, take, page };
}
