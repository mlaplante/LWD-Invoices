import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    user: { findFirst: vi.fn() },
    userOrganization: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/server/db";
import { withV1Auth, clearRateLimits } from "@/app/api/v1/auth";

const mockGetUser = vi.fn();

function mockSupabaseUser(user: object | null, error: object | null = null) {
  mockGetUser.mockResolvedValue({ data: { user }, error });
  vi.mocked(createAdminClient).mockReturnValue({
    auth: { getUser: mockGetUser },
  } as never);
}

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest(new URL("http://localhost/api/v1/clients"), {
    headers: { authorization: "Bearer test-token", ...headers },
  });
}

const supabaseUser = {
  id: "supabase-user-1",
  app_metadata: { organizationId: "stale-org-from-metadata" },
};

describe("withV1Auth membership resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimits();
  });

  it("rejects requests without a bearer token", async () => {
    const res = await withV1Auth(
      new NextRequest(new URL("http://localhost/api/v1/clients")),
      async () => NextResponse.json({ ok: true }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects invalid tokens", async () => {
    mockSupabaseUser(null, { message: "invalid" });
    const res = await withV1Auth(makeRequest(), async () =>
      NextResponse.json({ ok: true }),
    );
    expect(res.status).toBe(401);
  });

  it("does NOT grant access from app_metadata when no membership row exists", async () => {
    mockSupabaseUser(supabaseUser);
    vi.mocked(db.user.findFirst).mockResolvedValue({
      id: "db-user-1",
      isActive: true,
    } as never);
    vi.mocked(db.userOrganization.findFirst).mockResolvedValue(null as never);

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const res = await withV1Auth(makeRequest(), handler);

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects users with no internal user row", async () => {
    mockSupabaseUser(supabaseUser);
    vi.mocked(db.user.findFirst).mockResolvedValue(null as never);

    const res = await withV1Auth(makeRequest(), async () =>
      NextResponse.json({ ok: true }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects suspended users with 403", async () => {
    mockSupabaseUser(supabaseUser);
    vi.mocked(db.user.findFirst).mockResolvedValue({
      id: "db-user-1",
      isActive: false,
    } as never);

    const res = await withV1Auth(makeRequest(), async () =>
      NextResponse.json({ ok: true }),
    );
    expect(res.status).toBe(403);
    expect(db.userOrganization.findFirst).not.toHaveBeenCalled();
  });

  it("resolves the org from the first membership, not app_metadata", async () => {
    mockSupabaseUser(supabaseUser);
    vi.mocked(db.user.findFirst).mockResolvedValue({
      id: "db-user-1",
      isActive: true,
    } as never);
    vi.mocked(db.userOrganization.findFirst).mockResolvedValue({
      organizationId: "membership-org",
    } as never);

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const res = await withV1Auth(makeRequest(), handler);

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith({
      orgId: "membership-org",
      userId: "supabase-user-1",
    });
  });

  it("honors X-Organization-Id when the caller is a member", async () => {
    mockSupabaseUser(supabaseUser);
    vi.mocked(db.user.findFirst).mockResolvedValue({
      id: "db-user-1",
      isActive: true,
    } as never);
    vi.mocked(db.userOrganization.findUnique).mockResolvedValue({
      organizationId: "requested-org",
    } as never);

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const res = await withV1Auth(
      makeRequest({ "x-organization-id": "requested-org" }),
      handler,
    );

    expect(res.status).toBe(200);
    expect(db.userOrganization.findUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: "db-user-1",
          organizationId: "requested-org",
        },
      },
      select: { organizationId: true },
    });
    expect(handler).toHaveBeenCalledWith({
      orgId: "requested-org",
      userId: "supabase-user-1",
    });
  });

  it("rejects X-Organization-Id for orgs the caller is not a member of", async () => {
    mockSupabaseUser(supabaseUser);
    vi.mocked(db.user.findFirst).mockResolvedValue({
      id: "db-user-1",
      isActive: true,
    } as never);
    vi.mocked(db.userOrganization.findUnique).mockResolvedValue(null as never);

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const res = await withV1Auth(
      makeRequest({ "x-organization-id": "someone-elses-org" }),
      handler,
    );

    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});
