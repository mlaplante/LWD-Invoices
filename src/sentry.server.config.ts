// Node.js server-runtime Sentry initialization. Loaded by src/instrumentation.ts
// when NEXT_RUNTIME === "nodejs". This is where server profiling lives — the
// native profiler addon is not available on the edge runtime.
import * as Sentry from "@sentry/nextjs";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

import { env } from "@/lib/env";

Sentry.init({
  dsn: env.SENTRY_DSN,
  enabled: Boolean(env.SENTRY_DSN),
  environment: process.env.NODE_ENV,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Server-side profiling with the trace lifecycle: profiles are captured for
  // sampled transactions. profileSessionSampleRate gates which sessions profile.
  integrations: [
    nodeProfilingIntegration(),
    Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
  ],
  profileLifecycle: "trace",
  profileSessionSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  enableLogs: true,
});
