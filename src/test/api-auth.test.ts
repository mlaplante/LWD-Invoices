import { describe, it, expect } from "vitest";

describe("api-auth", () => {
  it("exports getAuthenticatedOrg and isAuthError", async () => {
    const mod = await import("@/lib/api-auth");
    expect(typeof mod.getAuthenticatedOrg).toBe("function");
    expect(typeof mod.isAuthError).toBe("function");
  });

  it("isAuthError returns true for Response objects", async () => {
    const { isAuthError } = await import("@/lib/api-auth");
    expect(isAuthError(new Response("Unauthorized", { status: 401 }))).toBe(true);
    expect(isAuthError({ user: { id: "1" }, orgId: "org1" })).toBe(false);
  });
});
