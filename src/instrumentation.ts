// Next.js server instrumentation hook. register() runs once per server runtime
// on startup; we load the matching Sentry config for the active runtime.
// onRequestError forwards uncaught errors from Server Components, route
// handlers, and server actions to Sentry.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
