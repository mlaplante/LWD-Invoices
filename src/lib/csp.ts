/**
 * Content Security Policy.
 *
 * Two policies exist while the nonce-based script policy is rolled out:
 *
 * - LEGACY_CSP — the enforced baseline, served as a static header from
 *   next.config.ts on every route. Its `script-src` still allows
 *   'unsafe-inline', which is what neutralises CSP as an XSS backstop.
 * - buildNonceCsp() — the target policy. `script-src` drops 'unsafe-inline'
 *   and instead allows only scripts carrying a per-request nonce. The proxy
 *   (src/proxy.ts) generates the nonce, forwards it to Next on the request
 *   (Next reads it from the CSP request header and stamps it on every script
 *   it emits), and sends the policy on the response.
 *
 * CSP_MODE selects how the proxy sends the nonce policy:
 *   - "report-only" (default): Content-Security-Policy-Report-Only. Nothing
 *     is blocked; violations are reported to Sentry. Ship this first.
 *   - "enforce": Content-Security-Policy. Blocks non-nonced inline script.
 *     On proxied routes this header replaces the same-named LEGACY_CSP
 *     header from next.config.ts (verified: one CSP header on the response);
 *     unproxied static files keep LEGACY_CSP.
 *   - "off": the proxy sends no nonce policy at all (instant rollback).
 *
 * style-src keeps 'unsafe-inline' in both: Radix positions popovers with
 * inline `style` attributes, which nonces can't cover. Adding a nonce to
 * style-src would also make browsers ignore 'unsafe-inline' there.
 */

const SCRIPT_HOSTS =
  "https://js.stripe.com https://www.paypal.com https://www.paypalobjects.com";

const SHARED_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com https://www.paypal.com",
  "object-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.paypal.com https://api-m.paypal.com https://api.resend.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://www.paypal.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
];

export const LEGACY_CSP = [
  ...SHARED_DIRECTIVES.slice(0, 5),
  `script-src 'self' 'unsafe-inline' ${SCRIPT_HOSTS}`,
  ...SHARED_DIRECTIVES.slice(5),
].join("; ");

export type CspMode = "report-only" | "enforce" | "off";

export function getCspMode(raw: string | undefined = process.env.CSP_MODE): CspMode {
  return raw === "enforce" || raw === "off" ? raw : "report-only";
}

/** 128 bits from the platform CSPRNG, base64-encoded (Web Crypto: works on Node and edge). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Sentry's CSP report endpoint, derived from the public DSN
 * (https://<key>@<host>/<projectId> → https://<host>/api/<projectId>/security/?sentry_key=<key>).
 * Returns null when no DSN is configured or it doesn't parse.
 */
export function sentryCspReportUri(
  dsn: string | undefined = process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: string | undefined = process.env.CONTEXT ?? process.env.NODE_ENV,
): string | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!url.username || !projectId || !/^\d+$/.test(projectId)) return null;
    const report = new URL(`${url.protocol}//${url.host}/api/${projectId}/security/`);
    report.searchParams.set("sentry_key", url.username);
    if (environment) report.searchParams.set("sentry_environment", environment);
    return report.toString();
  } catch {
    return null;
  }
}

export function buildNonceCsp(opts: {
  nonce: string;
  isDev?: boolean;
  reportUri?: string | null;
}): string {
  // React needs 'unsafe-eval' in development only (server error stacks);
  // neither React nor Next uses eval in production.
  const scriptSrc = `script-src 'self' 'nonce-${opts.nonce}'${opts.isDev ? " 'unsafe-eval'" : ""} ${SCRIPT_HOSTS}`;
  const directives = [
    ...SHARED_DIRECTIVES.slice(0, 5),
    scriptSrc,
    ...SHARED_DIRECTIVES.slice(5),
  ];
  if (opts.reportUri) directives.push(`report-uri ${opts.reportUri}`);
  return directives.join("; ");
}
