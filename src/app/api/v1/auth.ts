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

/**
 * Read the `aal` claim from an access token. Only call this on a token that
 * has already been verified (this does not check the signature). Returns
 * null when the claim is absent or the token is malformed, which callers
 * treat as "not aal2".
 */
export function tokenAal(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof claims?.aal === "string" ? claims.aal : null;
  } catch {
    return null;
  }
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

  // /api/v1 is a "public path" for the page middleware (src/proxy.ts), so the
  // MFA step-up it enforces never runs here. Mirror the check in
  // src/server/trpc.ts: when a second factor is enrolled, a password-only
  // (aal1) access token must not reach org data. getUser() above already
  // validated the token's signature, so its `aal` claim can be trusted.
  const hasVerifiedFactor = (user.factors ?? []).some(
    (f) => f.status === "verified",
  );
  if (hasVerifiedFactor && tokenAal(token) !== "aal2") {
    return NextResponse.json(
      { error: "Two-factor authentication required" },
      { status: 403 },
    );
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
