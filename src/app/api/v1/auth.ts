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

  const orgId = user.app_metadata?.organizationId as string | undefined;
  if (!orgId) {
    return NextResponse.json({ error: "No organization context" }, { status: 401 });
  }

  // Verify the organization exists
  const org = await db.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  return handler({ orgId, userId: user.id });
}

export function paginationParams(req: NextRequest) {
  const { skip, take, page } = paginationFromRequest(req);
  return { skip, take, page };
}
