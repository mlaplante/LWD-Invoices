// Node.js server-runtime Sentry initialization. Loaded by src/instrumentation.ts
// when NEXT_RUNTIME === "nodejs". This is where server profiling lives — the
// native profiler addon is not available on the edge runtime.
import * as Sentry from "@sentry/nextjs";

import { env } from "@/lib/env";

const sentryEnabled = Boolean(env.SENTRY_DSN);

// @sentry/profiling-node wraps a native addon (@sentry/node-cpu-profiler) that
// costs real time to load on every cold start. Only require it when Sentry is
// actually enabled — local dev, CI builds and previews without SENTRY_DSN skip
// it entirely. src/instrumentation.ts `await import`s this module, so the
// top-level await below completes before Next serves its first request.
const consoleLogging = Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] });
const integrations = sentryEnabled
  ? [(await import("@sentry/profiling-node")).nodeProfilingIntegration(), consoleLogging]
  : [consoleLogging];

Sentry.init({
  dsn: env.SENTRY_DSN,
  enabled: sentryEnabled,
  environment: process.env.NODE_ENV,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Server-side profiling with the trace lifecycle: profiles are captured for
  // sampled transactions. profileSessionSampleRate gates which sessions profile.
  integrations,
  profileLifecycle: "trace",
  profileSessionSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  enableLogs: true,
});
