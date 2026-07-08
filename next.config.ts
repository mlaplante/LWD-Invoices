import createBundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// CSP: keep 'unsafe-inline' on style-src for Tailwind/Radix runtime styles and
// inline <style> tags emitted by Next; remove if we move to a nonce strategy.
// connect-src includes Supabase (auth + storage), Stripe, PayPal, and Resend
// endpoints we hit from the browser.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com https://www.paypal.com",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://www.paypal.com https://www.paypalobjects.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.paypal.com https://api-m.paypal.com https://api.resend.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://www.paypal.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  // @sentry/profiling-node ships a native .node addon; it must be externalized
  // (not bundled) so it loads correctly in the Netlify/Lambda server runtime.
  serverExternalPackages: ["@react-pdf/renderer", "svix", "@anthropic-ai/sdk", "@sentry/profiling-node"],
  typescript: {
    // Type-check in CI separately — skip during next build to save ~10-20s
    ignoreBuildErrors: true,
  },
  experimental: {
    // Persist Turbopack's compilation cache to .next/cache so warm builds
    // (Netlify NETLIFY_NEXT_CACHE_PERSIST, CI actions/cache) skip recompiling
    // unchanged modules.
    turbopackFileSystemCacheForBuild: true,
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "date-fns",
      "sonner",
      "cmdk",
      "radix-ui",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Wrap with Sentry LAST so it composes over the bundle-analyzer config.
// Source maps upload only when SENTRY_AUTH_TOKEN is present (CI/Netlify);
// locally it's absent and upload is skipped. org/project/authToken come from
// the environment — see .env.example. tunnelRoute proxies browser events
// through same-origin /monitoring, so the strict CSP's `connect-src 'self'`
// already covers ingest (no CSP change needed) and ad-blockers don't drop them.
export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Quiet in local builds, verbose in CI.
  silent: !process.env.CI,
  // Upload source maps for the full client bundle (incl. third-party) for
  // readable stack traces, then delete them so they aren't served publicly.
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Route browser events through our own origin to satisfy the CSP.
  tunnelRoute: "/monitoring",
  // NOTE: `disableLogger` (Sentry debug-logger tree-shaking) is intentionally
  // omitted — it's deprecated in v10 and is a no-op under Turbopack, which is
  // this app's default builder. There's no Turbopack-supported equivalent yet.
});
