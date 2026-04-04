import { headers } from "next/headers";

/**
 * Derives the app URL from request headers.
 * Works correctly on Netlify where x-forwarded-proto is set.
 */
export async function getAppUrl(): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto =
    hdrs.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
