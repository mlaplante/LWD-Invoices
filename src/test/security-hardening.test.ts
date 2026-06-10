import { describe, it, expect, vi } from "vitest";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { hashToken } from "@/lib/secure-token";
import {
  createDashboardSession,
  getDashboardSession,
} from "@/server/services/portal-dashboard";

describe("safeRedirectPath (open-redirect guard)", () => {
  it("allows same-origin relative paths", () => {
    expect(safeRedirectPath("/invoices/123")).toBe("/invoices/123");
    expect(safeRedirectPath("/invite/abc?x=1")).toBe("/invite/abc?x=1");
  });

  it("rejects absolute URLs", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/");
    expect(safeRedirectPath("http://evil.com/phish")).toBe("/");
  });

  it("rejects protocol-relative and backslash variants", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/");
    expect(safeRedirectPath("/\\evil.com")).toBe("/");
  });

  it("rejects javascript: and other schemes", () => {
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/");
  });

  it("falls back for empty values", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  it("supports a custom fallback", () => {
    expect(safeRedirectPath("https://evil.com", "/dashboard")).toBe("/dashboard");
  });
});

describe("dashboard sessions are hashed at rest", () => {
  function mockDb() {
    const rows = new Map<string, { token: string; clientId: string; expiresAt: Date }>();
    return {
      rows,
      clientPortalSession: {
        create: vi.fn(async ({ data }: { data: { token: string; clientId: string; expiresAt: Date } }) => {
          rows.set(data.token, data);
          return data;
        }),
        findUnique: vi.fn(async ({ where }: { where: { token: string } }) =>
          rows.get(where.token) ?? null,
        ),
      },
    };
  }

  it("stores only the SHA-256 digest, never the plaintext token", async () => {
    const db = mockDb();
    const { sessionToken } = await createDashboardSession(db as never, {
      clientId: "client_1",
    });

    expect(db.rows.has(sessionToken)).toBe(false);
    expect(db.rows.has(hashToken(sessionToken))).toBe(true);
  });

  it("round-trips: the plaintext cookie token resolves the session", async () => {
    const db = mockDb();
    const { sessionToken } = await createDashboardSession(db as never, {
      clientId: "client_1",
    });

    const session = await getDashboardSession(db as never, sessionToken);
    expect(session?.clientId).toBe("client_1");
  });

  it("rejects expired sessions", async () => {
    const db = mockDb();
    const { sessionToken } = await createDashboardSession(db as never, {
      clientId: "client_1",
      durationMs: -1,
    });

    expect(await getDashboardSession(db as never, sessionToken)).toBeNull();
  });

  it("rejects a leaked database digest used directly as a cookie token", async () => {
    const db = mockDb();
    const { sessionToken } = await createDashboardSession(db as never, {
      clientId: "client_1",
    });

    // An attacker reading the DB gets hashToken(sessionToken); presenting that
    // digest as the cookie hashes it again and misses.
    expect(await getDashboardSession(db as never, hashToken(sessionToken))).toBeNull();
  });
});
