import { describe, it, expect } from "vitest";
import { pickMembership } from "@/server/user-context";

/**
 * `pickMembership` decides which organization a request is scoped to — every
 * `ctx.orgId` in the app is its return value. A regression here is a tenancy
 * bug, not a UX bug, so the cases below pin the selection rule explicitly.
 *
 * Rows are always passed in `createdAt asc` order (the query orders them), so
 * `rows[0]` is "earliest membership".
 */

const OWNER = { role: "OWNER", organizationId: "org-first" };
const ADMIN = { role: "ADMIN", organizationId: "org-second" };
const VIEWER = { role: "VIEWER", organizationId: "org-third" };
const ALL = [OWNER, ADMIN, VIEWER];

describe("pickMembership", () => {
  it("prefers the membership matching the active-org cookie", () => {
    expect(pickMembership(ALL, "org-second")).toBe(ADMIN);
    expect(pickMembership(ALL, "org-third")).toBe(VIEWER);
  });

  it("falls back to the earliest membership when no cookie is set", () => {
    expect(pickMembership(ALL, null)).toBe(OWNER);
  });

  it("ignores a cookie naming an org the user does not belong to", () => {
    // The security-critical case: a stale or forged cookie must never grant
    // access to an org with no membership row. It degrades to the fallback.
    expect(pickMembership(ALL, "org-not-a-member")).toBe(OWNER);
  });

  it("returns null when the user has no memberships at all", () => {
    expect(pickMembership([], null)).toBeNull();
    expect(pickMembership([], "org-first")).toBeNull();
  });

  it("never invents a membership for an empty-string cookie", () => {
    expect(pickMembership(ALL, "")).toBe(OWNER);
  });

  it("returns the role attached to the selected org, not a merged shape", () => {
    // Guards against a refactor that picks the org from one row and the role
    // from another — that would silently escalate or downgrade permissions.
    const picked = pickMembership(ALL, "org-third");
    expect(picked).toEqual({ role: "VIEWER", organizationId: "org-third" });
  });

  it("handles the single-membership case the cookie does not match", () => {
    expect(pickMembership([ADMIN], "org-first")).toBe(ADMIN);
  });
});
