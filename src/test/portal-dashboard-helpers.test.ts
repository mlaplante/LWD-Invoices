import { describe, it, expect } from "vitest";
import {
  isSessionExpired,
  generateSessionToken,
  SESSION_DURATION_MS,
} from "@/server/services/portal-dashboard";

describe("Portal Dashboard Helpers", () => {
  describe("isSessionExpired", () => {
    it("returns false for session created just now", () => {
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
      expect(isSessionExpired(expiresAt)).toBe(false);
    });

    it("returns true for session expired 1 hour ago", () => {
      const expiresAt = new Date(Date.now() - 3600000);
      expect(isSessionExpired(expiresAt)).toBe(true);
    });

    it("returns true for session expiring exactly now", () => {
      const expiresAt = new Date(Date.now());
      expect(isSessionExpired(expiresAt)).toBe(true);
    });
  });

  describe("generateSessionToken", () => {
    it("returns a 64-character hex string", () => {
      const token = generateSessionToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it("generates unique tokens", () => {
      const a = generateSessionToken();
      const b = generateSessionToken();
      expect(a).not.toBe(b);
    });
  });
});
