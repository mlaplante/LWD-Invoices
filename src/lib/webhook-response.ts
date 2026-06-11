import { NextResponse } from "next/server";

/**
 * JSON response for webhook endpoints with explicit hardening headers.
 *
 * The global `headers()` config in next.config.ts already applies
 * `X-Content-Type-Options: nosniff` site-wide, but webhook handlers set it
 * explicitly so the guarantee survives a future change to the global matcher
 * (these endpoints echo attacker-influenced error strings back to the caller).
 * `Cache-Control: no-store` keeps proxies from caching ack/error bodies.
 */
export function webhookJson(body: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: {
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
