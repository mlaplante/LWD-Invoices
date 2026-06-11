/**
 * Service worker for the LWD Invoices PWA.
 *
 * Deliberately conservative for a financial app:
 *  - Never caches API/tRPC/auth responses (org-scoped financial data must not
 *    persist in a shared browser cache).
 *  - Static Next.js assets (hashed filenames) are cached first-hit.
 *  - Navigations are network-first with an offline fallback page.
 *
 * Bump CACHE_VERSION to invalidate old caches on deploy of this file.
 */
const CACHE_VERSION = "v1";
const STATIC_CACHE = `lwd-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isCacheableStatic(url) {
  // Hashed, immutable build assets and the public icons/logo only.
  return (
    url.pathname.startsWith("/_next/static/") ||
    /^\/(icon-\d+\.png|logo.*\.png|favicon\.ico)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept data/auth endpoints.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Navigations: network-first, offline page as fallback. Page HTML is never
  // cached — it can embed org data.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
  }
});
