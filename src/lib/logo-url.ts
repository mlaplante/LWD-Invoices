/**
 * Whether a logo URL's host is allow-listed for next/image optimization.
 *
 * next.config.ts adds a `remotePatterns` entry for the Supabase Storage host
 * derived from `NEXT_PUBLIC_SUPABASE_URL` (falling back to the `*.supabase.co`
 * wildcard when that env var is unset, e.g. some CI contexts). next/image
 * throws at runtime for any remote host that isn't allow-listed, so any
 * component rendering an org logo must check this before dropping the
 * `unoptimized` prop — a self-hosted Supabase instance on a custom domain
 * (see README "Self-Hosting Guide") would not match `*.supabase.co`, and if
 * NEXT_PUBLIC_SUPABASE_URL points elsewhere than the bucket's actual host in
 * some deployment this keeps things safe rather than crashing the page.
 */
export function isOptimizableLogoUrl(url: string | null | undefined): boolean {
  if (!url) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (!parsed.pathname.startsWith("/storage/v1/object/public/")) return false;

  const configuredHost = getConfiguredSupabaseHost();
  if (configuredHost) return parsed.hostname === configuredHost;

  // No configured project URL to compare against (shouldn't happen outside
  // CI/test contexts) — fall back to the same wildcard next.config.ts uses.
  // Next's `*.supabase.co` pattern matches exactly one subdomain label, so
  // mirror that precisely rather than a loose `endsWith` (which would also
  // accept a multi-label host like "a.b.supabase.co" that next/image itself
  // would reject, defeating the point of this check).
  return /^[^.]+\.supabase\.co$/.test(parsed.hostname);
}

function getConfiguredSupabaseHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}
