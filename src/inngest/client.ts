import { SentryMiddleware } from "@inngest/middleware-sentry";
import { Inngest } from "inngest";

// SentryMiddleware captures errors and traces inside every Inngest function
// run (including the scheduled/cron jobs). Inngest catches function errors
// internally for retries, so they never reach Next's onRequestError — this
// middleware is what surfaces cron/background failures in Sentry. It relies on
// Sentry already being initialized, which happens in sentry.server.config.ts
// (the /api/inngest route runs on the Node.js runtime).
export const inngest = new Inngest({
  id: "laplante-web-development-invoices",
  middleware: [SentryMiddleware],
});
