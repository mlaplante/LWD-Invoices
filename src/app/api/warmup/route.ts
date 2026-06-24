import { NextResponse } from "next/server";
import { db } from "@/server/db";

export async function GET(request: Request) {
  const configuredSecret = process.env.WARMUP_SECRET;
  const providedSecret = request.headers.get("x-warmup-secret");

  if (
    process.env.NODE_ENV === "production" &&
    (!configuredSecret || providedSecret !== configuredSecret)
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
