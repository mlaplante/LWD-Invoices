import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

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
  // Also raise a Sentry *issue*. The console line above already ships as a
  // Sentry log (consoleLoggingIntegration captures warn/error), but logs are
  // neither grouped nor alertable — so a payment gateway silently failing to
  // decrypt or verify signatures for weeks looks like nothing at all. These
  // boundaries guard money movement; they deserve an issue you can alert on.
  Sentry.captureException(
    context.cause instanceof Error ? context.cause : new Error(`${context.route}: ${message}`),
    {
      level: status >= 500 ? "error" : "warning",
      tags: { route: context.route, status: String(status), errorId: id },
      extra: { ...context.meta, message },
    },
  );
  return NextResponse.json({ error: message, errorId: id }, { status });
}
