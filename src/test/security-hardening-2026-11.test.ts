import { describe, it, expect } from "vitest";
import { isReceiptPathForOrg } from "@/lib/receipt-path";
import { signPortalSession, verifyPortalSession } from "@/lib/portal-session";
import { getClientIp } from "@/lib/client-ip";
import { canLinkExistingUser } from "@/lib/account-link";
import { getBucketForPath } from "@/lib/rate-limiter";

const UUID = "3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b";

describe("isReceiptPathForOrg", () => {
  it("accepts exactly `${orgId}/${uuid}.${ext}`", () => {
    expect(isReceiptPathForOrg(`org-1/${UUID}.pdf`, "org-1")).toBe(true);
  });

  it.each([
    `org-1/../../proposals/org-2/inv/proposal.pdf`,
    `org-1/../org-2/${UUID}.png`,
    `org-1/%2e%2e/org-2/${UUID}.png`,
    `org-1/x/${UUID}.png`,
    `org-1-evil/${UUID}.png`,
    `org-2/${UUID}.png`,
    `/org-1/${UUID}.png`,
    `org-1/${UUID}.png/..`,
    `org-1/${UUID}`,
    "",
  ])("rejects %s", (path) => {
    expect(isReceiptPathForOrg(path, "org-1")).toBe(false);
  });

  it("rejects everything when the org id is empty", () => {
    expect(isReceiptPathForOrg(`/${UUID}.png`, "")).toBe(false);
  });
});

describe("portal session passphrase binding", () => {
  const SECRET = "s".repeat(40);

  it("verifies against the passphrase hash it was signed for", () => {
    const cookie = signPortalSession("tok", SECRET, 60, "hash-a");
    expect(verifyPortalSession(cookie, "tok", SECRET, "hash-a")).toBe(true);
  });

  it("is revoked when the passphrase hash changes", () => {
    const cookie = signPortalSession("tok", SECRET, 60, "hash-a");
    expect(verifyPortalSession(cookie, "tok", SECRET, "hash-b")).toBe(false);
  });

  it("rejects an unbound cookie where a passphrase is set", () => {
    const cookie = signPortalSession("tok", SECRET, 60);
    expect(verifyPortalSession(cookie, "tok", SECRET, "hash-a")).toBe(false);
  });
});

describe("getClientIp", () => {
  it("prefers the platform header over a spoofable x-forwarded-for", () => {
    const h = new Headers({
      "x-nf-client-connection-ip": "203.0.113.9",
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    });
    expect(getClientIp(h)).toBe("203.0.113.9");
  });

  it("falls back to the last forwarded hop, never the client-chosen first", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIp(h)).toBe("5.6.7.8");
  });
});

describe("canLinkExistingUser", () => {
  const verified = { id: "sb-1", email_confirmed_at: "2026-01-01T00:00:00Z" };

  it("allows a verified session to link an unlinked user", () => {
    expect(canLinkExistingUser(verified, { supabaseId: null })).toBe(true);
  });

  it("is idempotent for the already-linked identity", () => {
    expect(canLinkExistingUser(verified, { supabaseId: "sb-1" })).toBe(true);
  });

  it("refuses an unverified email", () => {
    expect(canLinkExistingUser({ id: "sb-1" }, { supabaseId: null })).toBe(false);
  });

  it("refuses to take over a user linked to another identity", () => {
    expect(canLinkExistingUser(verified, { supabaseId: "sb-2" })).toBe(false);
  });
});

describe("getBucketForPath — token surfaces", () => {
  it.each([
    "/contractor/abc",
    "/api/contractor-portal/abc/w9",
    "/unsubscribe/abc",
    "/api/email-preferences/abc",
    "/api/trpc/portal.addComment",
  ])("rate-limits %s in the portal bucket", (path) => {
    expect(getBucketForPath(path)).toBe("portal");
  });

  it("does not throttle the authenticated dashboard", () => {
    expect(getBucketForPath("/contractors")).toBeNull();
    expect(getBucketForPath("/api/trpc/invoices.list")).toBeNull();
  });
});
