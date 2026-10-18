import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/rate-limiter", () => ({
  getRateLimiters: () => null,
  getBucketForPath: () => null,
}));

import { proxy } from "@/proxy";

describe("proxy Server Action guard", () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  it("rejects forged Next-Action POSTs with 404 before touching auth", async () => {
    const req = new NextRequest("https://app.example.com/sign-in", {
      method: "POST",
      headers: { "next-action": "deadbeef", "content-type": "text/plain" },
      body: "[]",
    });

    const res = await proxy(req);

    expect(res.status).toBe(404);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("lets ordinary requests to public pages through", async () => {
    const req = new NextRequest("https://app.example.com/sign-in");

    const res = await proxy(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
