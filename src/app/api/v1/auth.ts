import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/server/db";

export interface V1Context {
  orgId: string;
  userId: string;
}

// Simple in-memory sliding-window rate limiter: 60 requests per token per minute
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT = 60;
const WINDOW_MS = 60_000;

export function clearRateLimits() {
  rateLimitMap.clear();
}

export function isRateLimited(token: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(token) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  rateLimitMap.set(token, timestamps);
  return false;
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
  const url = new URL(req.url);
  const rawPage = parseInt(url.searchParams.get("page") ?? "1", 10);
  const rawPerPage = parseInt(url.searchParams.get("per_page") ?? "20", 10);
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const perPage = isNaN(rawPerPage) || rawPerPage < 1 ? 20 : Math.min(rawPerPage, 100);
  return { skip: (page - 1) * perPage, take: perPage, page };
}
