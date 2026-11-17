import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { receiptHref } from "@/lib/receipt-link";

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedOrg: vi.fn(),
  isAuthError: (r: unknown) => r instanceof Response,
}));

vi.mock("@/lib/supabase-storage", () => ({
  createReceiptSignedUrl: vi.fn(),
}));

import { getAuthenticatedOrg } from "@/lib/api-auth";
import { createReceiptSignedUrl } from "@/lib/supabase-storage";
import { GET } from "@/app/api/receipts/view/route";

describe("receiptHref", () => {
  it("rewrites legacy public receipts URLs to the authenticated view route", () => {
    expect(
      receiptHref(
        "https://test.supabase.co/storage/v1/object/public/receipts/org-1/abc.png",
      ),
    ).toBe("/api/receipts/view?path=org-1%2Fabc.png");
  });

  it("passes through app view URLs unchanged", () => {
    const appUrl = "https://app.example.com/api/receipts/view?path=org-1%2Fabc.png";
    expect(receiptHref(appUrl)).toBe(appUrl);
  });

  it("passes through unrelated URLs unchanged", () => {
    expect(receiptHref("https://example.com/file.pdf")).toBe(
      "https://example.com/file.pdf",
    );
  });
});

describe("GET /api/receipts/view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeRequest(path?: string) {
    const url = new URL("http://localhost/api/receipts/view");
    if (path !== undefined) url.searchParams.set("path", path);
    return new NextRequest(url);
  }

  it("requires authentication", async () => {
    vi.mocked(getAuthenticatedOrg).mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );

    const res = await GET(makeRequest("org-1/abc.png"));
    expect(res.status).toBe(401);
  });

  it("rejects paths outside the caller's org", async () => {
    vi.mocked(getAuthenticatedOrg).mockResolvedValue({
      user: { id: "u1" },
      orgId: "org-1",
    });

    const res = await GET(makeRequest("org-2/abc.png"));
    expect(res.status).toBe(404);
    expect(createReceiptSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects prefix-forgery paths like org-1-evil/", async () => {
    vi.mocked(getAuthenticatedOrg).mockResolvedValue({
      user: { id: "u1" },
      orgId: "org-1",
    });

    const res = await GET(makeRequest("org-1-evil/abc.png"));
    expect(res.status).toBe(404);
  });

  it("redirects to a signed URL for in-org receipts", async () => {
    vi.mocked(getAuthenticatedOrg).mockResolvedValue({
      user: { id: "u1" },
      orgId: "org-1",
    });
    vi.mocked(createReceiptSignedUrl).mockResolvedValue(
      "https://signed.example/receipt?token=abc",
    );

    const res = await GET(makeRequest("org-1/3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b.png"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://signed.example/receipt?token=abc",
    );
    expect(createReceiptSignedUrl).toHaveBeenCalledWith("org-1/3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b.png");
  });

  // The storage client concatenates the path into a URL and fetch() collapses
  // dot segments, so a path that merely *starts* with the caller's org id can
  // resolve into another bucket / another org's folder.
  it.each([
    "org-1/../../proposals/org-2/inv-9/proposal.pdf",
    "org-1/../org-2/3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b.png",
    "org-1/%2e%2e/%2e%2e/contractor-w9/org-2/c1/w9.pdf",
    "org-1/sub/3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b.png",
    "org-1/..\\..\\proposals/x.pdf",
    "org-1/abc.png",
  ])("rejects traversal / off-shape path %s", async (path) => {
    vi.mocked(getAuthenticatedOrg).mockResolvedValue({
      user: { id: "u1" },
      orgId: "org-1",
    });
    vi.mocked(createReceiptSignedUrl).mockClear();

    const res = await GET(makeRequest(path));
    expect(res.status).toBe(404);
    expect(createReceiptSignedUrl).not.toHaveBeenCalled();
  });

  it("returns 404 when the file is unavailable", async () => {
    vi.mocked(getAuthenticatedOrg).mockResolvedValue({
      user: { id: "u1" },
      orgId: "org-1",
    });
    vi.mocked(createReceiptSignedUrl).mockResolvedValue(null);

    const res = await GET(makeRequest("org-1/3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b.png"));
    expect(res.status).toBe(404);
  });

  it("returns 400 when path is missing", async () => {
    vi.mocked(getAuthenticatedOrg).mockResolvedValue({
      user: { id: "u1" },
      orgId: "org-1",
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });
});
