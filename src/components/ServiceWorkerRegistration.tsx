"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker (public/sw.js). Production-only: in dev a
 * stale worker intercepting HMR/navigation requests is a debugging trap.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  }, []);

  return null;
}
