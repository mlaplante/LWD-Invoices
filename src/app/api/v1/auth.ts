import { NextRequest, NextResponse } from "next/server";

export interface V1Context {
  orgId: string;
  userId: string;
}

// Simple in-memory sliding-window rate limiter: 60 requests per token per minute
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT = 60;
const WINDOW_MS = 60_000;

function isRateLimited(token: string): boolean {
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

  // Validate token via Clerk's verify endpoint
  const verifyRes = await fetch("https://api.clerk.com/v1/sessions/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });

  if (!verifyRes.ok) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const session = (await verifyRes.json()) as { user_id: string; organization_id?: string };
  if (!session.organization_id) {
    return NextResponse.json({ error: "No organization context" }, { status: 401 });
  }

  return handler({ orgId: session.organization_id, userId: session.user_id });
}

export function paginationParams(req: NextRequest) {
  const url = new URL(req.url);
  const rawPage = parseInt(url.searchParams.get("page") ?? "1", 10);
  const rawPerPage = parseInt(url.searchParams.get("per_page") ?? "20", 10);
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const perPage = isNaN(rawPerPage) || rawPerPage < 1 ? 20 : Math.min(rawPerPage, 100);
  return { skip: (page - 1) * perPage, take: perPage, page };
}
