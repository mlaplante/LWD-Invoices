import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

/**
 * Logs an error server-side with a short request id and returns a JSON
 * response that exposes only a generic message + the id. Use this on any
 * boundary that might surface payment-gateway, encryption, or PDF-render
 * errors to a client — those errors can include keys, file paths, and
 * library internals that should never reach the browser.
 */
export function safeErrorResponse(
  message: string,
  status: number,
  context: { route: string; cause?: unknown; meta?: Record<string, unknown> },
): NextResponse {
  const id = randomBytes(4).toString("hex");
  // Single structured log line so it's grep-able in the platform logs.
  console.error("[api-error]", {
    id,
    route: context.route,
    status,
    meta: context.meta,
    cause: context.cause instanceof Error
      ? { name: context.cause.name, message: context.cause.message, stack: context.cause.stack }
      : context.cause,
  });
  return NextResponse.json({ error: message, errorId: id }, { status });
}
