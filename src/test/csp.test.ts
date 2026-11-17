import { describe, it, expect } from "vitest";
import {
  LEGACY_CSP,
  buildNonceCsp,
  generateNonce,
  getCspMode,
  sentryCspReportUri,
} from "@/lib/csp";

const scriptSrc = (policy: string) =>
  policy.split("; ").find((d) => d.startsWith("script-src ")) ?? "";

describe("buildNonceCsp", () => {
  it("allows only nonced inline script — no 'unsafe-inline' in script-src", () => {
    const policy = buildNonceCsp({ nonce: "abc123" });
    expect(scriptSrc(policy)).toContain("'nonce-abc123'");
    expect(scriptSrc(policy)).not.toContain("'unsafe-inline'");
    expect(scriptSrc(policy)).not.toContain("'unsafe-eval'");
  });

  it("adds 'unsafe-eval' only in development", () => {
    expect(scriptSrc(buildNonceCsp({ nonce: "n", isDev: true }))).toContain("'unsafe-eval'");
  });

  it("keeps the baseline directives the legacy policy enforces", () => {
    const policy = buildNonceCsp({ nonce: "n" });
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"]) {
      expect(policy).toContain(d);
    }
    // style-src must not carry a nonce: that would disable its 'unsafe-inline',
    // which Radix's inline style attributes depend on.
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).not.toMatch(/style-src[^;]*nonce-/);
  });

  it("appends a report-uri when given one", () => {
    expect(buildNonceCsp({ nonce: "n", reportUri: "https://r.test/x" })).toMatch(
      /; report-uri https:\/\/r\.test\/x$/,
    );
  });
});

describe("LEGACY_CSP", () => {
  it("is the unchanged enforced baseline", () => {
    expect(scriptSrc(LEGACY_CSP)).toContain("'unsafe-inline'");
    expect(LEGACY_CSP).not.toContain("nonce-");
  });
});

describe("generateNonce", () => {
  it("returns distinct 128-bit base64 values", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("getCspMode", () => {
  it("defaults to report-only and accepts only known modes", () => {
    expect(getCspMode(undefined)).toBe("report-only");
    expect(getCspMode("enforce")).toBe("enforce");
    expect(getCspMode("off")).toBe("off");
    expect(getCspMode("ENFORCE")).toBe("report-only");
  });
});

describe("sentryCspReportUri", () => {
  it("derives Sentry's security endpoint from the DSN", () => {
    expect(sentryCspReportUri("https://pubkey@o1.ingest.sentry.io/4507", "production")).toBe(
      "https://o1.ingest.sentry.io/api/4507/security/?sentry_key=pubkey&sentry_environment=production",
    );
  });

  it("returns null for a missing or malformed DSN", () => {
    expect(sentryCspReportUri(undefined)).toBeNull();
    expect(sentryCspReportUri("not a url")).toBeNull();
    expect(sentryCspReportUri("https://o1.ingest.sentry.io/4507")).toBeNull();
  });
});
