import createBundleAnalyzer from "@next/bundle-analyzer";

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

const nextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  serverExternalPackages: ["@react-pdf/renderer", "svix", "@anthropic-ai/sdk"],
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

export default withBundleAnalyzer(nextConfig);
