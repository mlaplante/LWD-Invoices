import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { db } from "@/server/db";

// Constant-time comparison. Hashing first gives equal-length buffers, so
// neither the secret's length nor its prefix leaks through response timing.
function secretsMatch(provided: string | null, configured: string | undefined) {
  if (!provided || !configured) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const configuredSecret = process.env.WARMUP_SECRET;
  const providedSecret = request.headers.get("x-warmup-secret");

  if (
    process.env.NODE_ENV === "production" &&
    !secretsMatch(providedSecret, configuredSecret)
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const startedAt = Date.now();
  await db.$queryRaw`SELECT 1`;

  return NextResponse.json(
    { ok: true, latencyMs: Date.now() - startedAt },
    { headers: { "cache-control": "no-store" } },
  );
}
