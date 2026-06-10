import { randomBytes } from "crypto";
import { hashToken } from "@/lib/secure-token";

type Db = typeof import("../db").db;

/** Session duration: 30 days in milliseconds */
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/** Cookie that carries the (plaintext) dashboard session token. */
export function dashboardSessionCookieName(clientToken: string): string {
  return `portal_dashboard_${clientToken}`;
}

/**
 * Cookie options for the dashboard session. Path is "/" (not the dashboard
 * route) because tRPC portal procedures at /api/trpc also validate this
 * session; the token itself is the secret, not the path scoping.
 */
export function dashboardSessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: maxAgeSeconds,
    path: "/",
  };
}

/**
 * Check if a portal session has expired.
 * Returns true if expiresAt is in the past or exactly now.
 */
export function isSessionExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}

/**
 * Generate a cryptographically secure session token (32 bytes / 64 hex chars).
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Create a dashboard session. Only the SHA-256 digest of the token is stored,
 * so a database leak doesn't expose usable session tokens; the plaintext is
 * returned once for the cookie.
 */
export async function createDashboardSession(
  db: Db,
  opts: {
    clientId: string;
    durationMs?: number;
    userAgent?: string;
    ipAddress?: string;
  },
): Promise<{ sessionToken: string; expiresAt: Date }> {
  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + (opts.durationMs ?? SESSION_DURATION_MS));

  await db.clientPortalSession.create({
    data: {
      token: hashToken(sessionToken),
      expiresAt,
      clientId: opts.clientId,
      userAgent: opts.userAgent,
      ipAddress: opts.ipAddress,
    },
  });

  return { sessionToken, expiresAt };
}

/**
 * Look up a session by the plaintext token presented in the cookie.
 * Returns null when the session is unknown or expired.
 */
export async function getDashboardSession(
  db: Db,
  presentedToken: string,
): Promise<{ clientId: string; expiresAt: Date } | null> {
  const session = await db.clientPortalSession.findUnique({
    where: { token: hashToken(presentedToken) },
    select: { clientId: true, expiresAt: true },
  });
  if (!session || isSessionExpired(session.expiresAt)) return null;
  return session;
}
