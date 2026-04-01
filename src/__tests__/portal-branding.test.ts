import { describe, it, expect } from "vitest";
import { getPortalBranding } from "@/lib/portal-branding";

describe("getPortalBranding", () => {
  const baseOrg = {
    name: "Acme Corp",
    logoUrl: "https://example.com/logo.png",
    brandColor: "#ff0000",
  };

  it("returns defaults when optional fields are missing", () => {
    const result = getPortalBranding(baseOrg);
    expect(result.brandColor).toBe("#ff0000");
    expect(result.tagline).toBeNull();
    expect(result.footerText).toBeNull();
    expect(result.fontClass).toBe("font-sans");
    expect(result.hidePoweredBy).toBe(false);
  });

  it("uses default brand color when null", () => {
    const result = getPortalBranding({ ...baseOrg, brandColor: null });
    expect(result.brandColor).toBe("#2563eb");
  });

  it("maps georgia font correctly", () => {
    const result = getPortalBranding({ ...baseOrg, brandFont: "georgia" });
    expect(result.fontClass).toBe("font-serif");
    expect(result.fontFamily).toContain("Georgia");
  });

  it("maps system font correctly", () => {
    const result = getPortalBranding({ ...baseOrg, brandFont: "system" });
    expect(result.fontClass).toBe("font-sans");
    expect(result.fontFamily).toContain("BlinkMacSystemFont");
  });

  it("passes through tagline and footer text", () => {
    const result = getPortalBranding({
      ...baseOrg,
      portalTagline: "We build things",
      portalFooterText: "Thanks for your business",
    });
    expect(result.tagline).toBe("We build things");
    expect(result.footerText).toBe("Thanks for your business");
  });

  it("respects hidePoweredBy", () => {
    const result = getPortalBranding({ ...baseOrg, hidePoweredBy: true });
    expect(result.hidePoweredBy).toBe(true);
  });
});
