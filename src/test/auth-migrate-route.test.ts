import { describe, it, expect, beforeEach, vi } from "vitest";

// Regression test for F18: app_metadata writes that establish organizationId
// must also carry the org's real require2FA value, or proxy.ts's MFA gate
// (which reads app_metadata.require2FA directly, with no DB fallback) silently
// skips enrollment/step-up for users who just migrated/joined.

const getUserMock = vi.fn();
const updateUserByIdMock = vi.fn().mockResolvedValue({ error: null });
const userFindFirstMock = vi.fn();
const userUpdateMock = vi.fn().mockResolvedValue({});
const userOrganizationFindFirstMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { updateUserById: updateUserByIdMock } },
  }),
}));

vi.mock("@/server/db", () => ({
  db: {
    user: { findFirst: userFindFirstMock, update: userUpdateMock },
    userOrganization: { findFirst: userOrganizationFindFirstMock },
  },
}));

describe("POST /api/auth/migrate — app_metadata require2FA sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUserByIdMock.mockResolvedValue({ error: null });
    getUserMock.mockResolvedValue({
      data: { user: { id: "sb-user-1", email: "legacy@example.com", app_metadata: {} } },
    });
    userFindFirstMock.mockResolvedValue({ id: "db-user-1", email: "legacy@example.com" });
  });

  it("carries the org's require2FA=true into app_metadata so the MFA gate isn't skipped", async () => {
    userOrganizationFindFirstMock.mockResolvedValue({
      role: "MEMBER",
      organization: { id: "org-acme", name: "Acme", require2FA: true },
    });

    const { POST } = await import("@/app/api/auth/migrate/route");
    await POST();

    expect(updateUserByIdMock).toHaveBeenCalledWith(
      "sb-user-1",
      expect.objectContaining({
        app_metadata: expect.objectContaining({
          organizationId: "org-acme",
          require2FA: true,
        }),
      }),
    );
  });

  it("writes require2FA=false (not undefined) for an org that doesn't require it", async () => {
    userOrganizationFindFirstMock.mockResolvedValue({
      role: "MEMBER",
      organization: { id: "org-beta", name: "Beta", require2FA: false },
    });

    const { POST } = await import("@/app/api/auth/migrate/route");
    await POST();

    expect(updateUserByIdMock).toHaveBeenCalledWith(
      "sb-user-1",
      expect.objectContaining({
        app_metadata: expect.objectContaining({ require2FA: false }),
      }),
    );
  });
});
