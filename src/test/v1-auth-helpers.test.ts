import { describe, it, expect, beforeEach } from "vitest";
import { isRateLimited, clearRateLimits, paginationParams } from "@/app/api/v1/auth";
import { NextRequest } from "next/server";

describe("V1 API Auth Helpers", () => {
  beforeEach(() => {
    clearRateLimits();
  });

  function createRequest(url: string): NextRequest {
    return new NextRequest(new URL(url, "http://localhost"));
  }

  describe("isRateLimited", () => {
    it("returns false for first request", () => {
      const result = isRateLimited("test-token");
      expect(result).toBe(false);
    });

    it("allows up to 60 requests in a minute", () => {
      const token = "test-token";
      for (let i = 0; i < 60; i++) {
        expect(isRateLimited(token)).toBe(false);
      }
    });

    it("blocks 61st request within the window", () => {
      const token = "test-token";
      // Make 60 requests
      for (let i = 0; i < 60; i++) {
        isRateLimited(token);
      }
      // 61st should be blocked
      expect(isRateLimited(token)).toBe(true);
    });

    it("allows different tokens independently", () => {
      // First token hits limit
      for (let i = 0; i < 60; i++) {
        isRateLimited("token-1");
      }
      expect(isRateLimited("token-1")).toBe(true);

      // Second token should still be available
      expect(isRateLimited("token-2")).toBe(false);
    });

    it("tracks multiple tokens separately", () => {
      const token1 = "token-1";
      const token2 = "token-2";

      for (let i = 0; i < 30; i++) {
        isRateLimited(token1);
        isRateLimited(token2);
      }

      // Both should have room for 30 more
      expect(isRateLimited(token1)).toBe(false);
      expect(isRateLimited(token2)).toBe(false);
    });

    it("counts each call as a request", () => {
      const token = "test-token";

      // Make exactly 60 requests
      for (let i = 0; i < 60; i++) {
        const result = isRateLimited(token);
        expect(result).toBe(false);
      }

      // 61st should fail
      expect(isRateLimited(token)).toBe(true);
    });

    it("handles rapid successive calls", () => {
      const token = "test-token";
      let blockedAt = -1;

      for (let i = 0; i < 70; i++) {
        if (isRateLimited(token) && blockedAt === -1) {
          blockedAt = i;
        }
      }

      expect(blockedAt).toBe(60);
    });

    it("resets after window expires (simulated with new tokens)", () => {
      clearRateLimits();
      const token = "test-token";

      // Fill up the limit
      for (let i = 0; i < 60; i++) {
        isRateLimited(token);
      }
      expect(isRateLimited(token)).toBe(true);

      // Clear and verify new token works
      clearRateLimits();
      expect(isRateLimited(token)).toBe(false);
    });

    it("maintains separate limits for empty and non-empty tokens", () => {
      expect(isRateLimited("")).toBe(false);
      expect(isRateLimited("non-empty")).toBe(false);
    });
  });

  describe("paginationParams", () => {
    it("returns defaults when no params provided", () => {
      const req = createRequest("http://localhost/api/v1/clients");
      const result = paginationParams(req);

      expect(result.page).toBe(1);
      expect(result.skip).toBe(0);
      expect(result.take).toBe(20);
    });

    it("parses page parameter", () => {
      const req = createRequest("http://localhost/api/v1/clients?page=3");
      const result = paginationParams(req);

      expect(result.page).toBe(3);
      expect(result.skip).toBe(40); // (3-1) * 20
      expect(result.take).toBe(20);
    });

    it("parses per_page parameter", () => {
      const req = createRequest("http://localhost/api/v1/clients?per_page=50");
      const result = paginationParams(req);

      expect(result.page).toBe(1);
      expect(result.skip).toBe(0);
      expect(result.take).toBe(50);
    });

    it("parses both page and per_page", () => {
      const req = createRequest(
        "http://localhost/api/v1/clients?page=2&per_page=25",
      );
      const result = paginationParams(req);

      expect(result.page).toBe(2);
      expect(result.skip).toBe(25); // (2-1) * 25
      expect(result.take).toBe(25);
    });

    it("caps per_page at 100", () => {
      const req = createRequest("http://localhost/api/v1/clients?per_page=200");
      const result = paginationParams(req);

      expect(result.take).toBe(100);
    });

    it("handles per_page=0 as invalid, uses default", () => {
      const req = createRequest("http://localhost/api/v1/clients?per_page=0");
      const result = paginationParams(req);

      expect(result.take).toBe(20);
    });

    it("handles negative page as invalid, uses 1", () => {
      const req = createRequest("http://localhost/api/v1/clients?page=-5");
      const result = paginationParams(req);

      expect(result.page).toBe(1);
      expect(result.skip).toBe(0);
    });

    it("handles page=0 as invalid, uses 1", () => {
      const req = createRequest("http://localhost/api/v1/clients?page=0");
      const result = paginationParams(req);

      expect(result.page).toBe(1);
      expect(result.skip).toBe(0);
    });

    it("handles non-numeric page as invalid, uses 1", () => {
      const req = createRequest("http://localhost/api/v1/clients?page=abc");
      const result = paginationParams(req);

      expect(result.page).toBe(1);
      expect(result.skip).toBe(0);
    });

    it("handles non-numeric per_page as invalid, uses default", () => {
      const req = createRequest("http://localhost/api/v1/clients?per_page=xyz");
      const result = paginationParams(req);

      expect(result.take).toBe(20);
    });

    it("handles large page numbers", () => {
      const req = createRequest("http://localhost/api/v1/clients?page=1000");
      const result = paginationParams(req);

      expect(result.page).toBe(1000);
      expect(result.skip).toBe(19980); // (1000-1) * 20
    });

    it("handles maximum per_page=100", () => {
      const req = createRequest("http://localhost/api/v1/clients?per_page=100");
      const result = paginationParams(req);

      expect(result.take).toBe(100);
    });

    it("calculates skip correctly for pagination", () => {
      const req = createRequest("http://localhost/api/v1/clients?page=5&per_page=10");
      const result = paginationParams(req);

      expect(result.skip).toBe(40); // (5-1) * 10
      expect(result.take).toBe(10);
    });

    it("handles query params with other params present", () => {
      const req = createRequest(
        "http://localhost/api/v1/clients?filter=active&page=2&sort=name",
      );
      const result = paginationParams(req);

      expect(result.page).toBe(2);
      expect(result.skip).toBe(20);
      expect(result.take).toBe(20);
    });

    it("handles page at boundary (1)", () => {
      const req = createRequest("http://localhost/api/v1/clients?page=1");
      const result = paginationParams(req);

      expect(result.page).toBe(1);
      expect(result.skip).toBe(0);
    });

    it("handles decimal numbers by truncating", () => {
      const req = createRequest("http://localhost/api/v1/clients?page=2.9&per_page=15.5");
      const result = paginationParams(req);

      expect(result.page).toBe(2);
      expect(result.take).toBe(15);
    });
  });

  describe("clearRateLimits", () => {
    it("clears all rate limit state", () => {
      const token = "test-token";

      // Fill up limit
      for (let i = 0; i < 60; i++) {
        isRateLimited(token);
      }
      expect(isRateLimited(token)).toBe(true);

      // Clear and verify
      clearRateLimits();
      expect(isRateLimited(token)).toBe(false);
    });

    it("clears multiple tokens", () => {
      const token1 = "token-1";
      const token2 = "token-2";

      for (let i = 0; i < 60; i++) {
        isRateLimited(token1);
        isRateLimited(token2);
      }

      clearRateLimits();

      expect(isRateLimited(token1)).toBe(false);
      expect(isRateLimited(token2)).toBe(false);
    });
  });

  describe("Integration", () => {
    it("rate limiting works with pagination parsing", () => {
      const req = createRequest("http://localhost/api/v1/clients?page=1&per_page=20");
      const paginationResult = paginationParams(req);

      expect(paginationResult.page).toBe(1);

      const token = "test-token";
      expect(isRateLimited(token)).toBe(false);
    });

    it("handles realistic API usage pattern", () => {
      const token = "client-app-token";

      // Simulate 45 requests
      for (let i = 0; i < 45; i++) {
        expect(isRateLimited(token)).toBe(false);
      }

      // 15 more should work
      for (let i = 0; i < 15; i++) {
        expect(isRateLimited(token)).toBe(false);
      }

      // 1 more should fail
      expect(isRateLimited(token)).toBe(true);

      // Clear and retry
      clearRateLimits();
      expect(isRateLimited(token)).toBe(false);
    });

    it("different clients can paginate at different rates", () => {
      const req1 = createRequest("http://localhost/api/v1/clients?page=1");
      const req2 = createRequest("http://localhost/api/v1/clients?page=100");

      const params1 = paginationParams(req1);
      const params2 = paginationParams(req2);

      expect(params1.skip).toBe(0);
      expect(params2.skip).toBe(1980);

      // Both should be rate limited independently
      const token1 = "token-1";
      const token2 = "token-2";

      expect(isRateLimited(token1)).toBe(false);
      expect(isRateLimited(token2)).toBe(false);
    });
  });
});
