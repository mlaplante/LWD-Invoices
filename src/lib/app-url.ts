import { headers } from "next/headers";
import { env } from "./env";

/**
 * Resolves the app URL. Production must use the configured canonical origin so
 * attacker-controlled Host/X-Forwarded-* headers cannot poison emails or
 * redirects. Development keeps header-derived URLs for local tunnels.
 */
export async function getAppUrl(): Promise<string> {
  const hdrs = await headers();
  return resolveAppUrlFromHeaders(hdrs);
}

export function resolveAppUrlFromHeaders(hdrs: Headers): string {
  if (process.env.NODE_ENV === "production") {
    return new URL(env.NEXT_PUBLIC_APP_URL).origin;
  }

  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto =
    hdrs.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
