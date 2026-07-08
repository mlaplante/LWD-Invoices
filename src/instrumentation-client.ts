// Browser-side Sentry initialization. Next.js loads this automatically for
// the client bundle (replaces the old sentry.client.config.ts). Keep it lean:
// no Session Replay — this app renders customer PII (TINs, payment details)
// and we don't want it recorded.
import * as Sentry from "@sentry/nextjs";

import { env } from "@/lib/env";

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  // No DSN configured (local dev / preview without Sentry) → don't send.
  enabled: Boolean(env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV,

  // Performance tracing: full sampling in dev, 10% in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Structured logging → Sentry Logs. Forward only warn/error console output;
  // this app logs customer data at lower levels, so log/info/debug are excluded
  // to keep PII out of Sentry.
  enableLogs: true,
  integrations: [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })],
});

// Instruments App Router client-side navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
