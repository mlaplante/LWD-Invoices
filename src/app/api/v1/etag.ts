import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * RFC 7232 strong ETag + If-None-Match short-circuit for authenticated,
 * org-scoped GET endpoints.
 *
 * Multi-tenant safety:
 *   - The ETag is computed over the serialized body which already contains
 *     only that caller's org data, so the hash is implicitly tenant-scoped.
 *   - Cache-Control is "private" — never "public" — so no shared cache
 *     (CDN, browser of another user) can serve it to the wrong tenant.
 *   - Vary: Authorization defends against proxies that do cache private
 *     responses at the connection level.
 */
export function jsonWithETag(
  req: NextRequest,
  body: unknown,
  init: { status?: number; maxAgeSeconds?: number } = {}
): NextResponse {
  const status = init.status ?? 200;
  const maxAge = init.maxAgeSeconds ?? 0;

  const payload = JSON.stringify(body);
  // Strong ETag: quoted SHA-256 hex truncated to 32 chars (128 bits of entropy).
  const etag = `"${createHash("sha256").update(payload).digest("hex").slice(0, 32)}"`;

  const incoming = req.headers.get("if-none-match");
  if (incoming && incoming === etag) {
    // 304 must not include a body. Preserve ETag + Cache-Control per RFC 7232.
    return new NextResponse(null, {
      status: 304,
      headers: buildHeaders(etag, maxAge),
    });
  }

  return new NextResponse(payload, {
    status,
    headers: {
      ...buildHeaders(etag, maxAge),
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function buildHeaders(etag: string, maxAgeSeconds: number): Record<string, string> {
  const cacheControl =
    maxAgeSeconds > 0
      ? `private, max-age=${maxAgeSeconds}, must-revalidate`
      : "private, no-cache, must-revalidate";
  return {
    etag,
    "cache-control": cacheControl,
    vary: "Authorization",
  };
}
