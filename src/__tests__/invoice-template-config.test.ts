import { describe, it, expect } from "vitest";
import { getInvoiceTemplateConfig } from "@/server/services/invoice-template-config";

describe("getInvoiceTemplateConfig", () => {
  const baseOrg = { brandColor: "#ff0000" };

  it("returns modern template by default", () => {
    const config = getInvoiceTemplateConfig(baseOrg);
    expect(config.template).toBe("modern");
    expect(config.fontFamily).toBe("Helvetica");
    expect(config.accentColor).toBe("#ff0000");
    expect(config.showLogo).toBe(true);
    expect(config.footerText).toBeNull();
  });

  it("falls back to brandColor when invoiceAccentColor is null", () => {
    const config = getInvoiceTemplateConfig({
      ...baseOrg,
      invoiceAccentColor: null,
    });
    expect(config.accentColor).toBe("#ff0000");
  });

  it("uses invoiceAccentColor when set", () => {
    const config = getInvoiceTemplateConfig({
      ...baseOrg,
      invoiceAccentColor: "#00ff00",
    });
    expect(config.accentColor).toBe("#00ff00");
  });

  it("falls back to default when both colors are null", () => {
    const config = getInvoiceTemplateConfig({ brandColor: null });
    expect(config.accentColor).toBe("#2563eb");
  });

  it("maps georgia to Times-Roman for React PDF", () => {
    const config = getInvoiceTemplateConfig({
      ...baseOrg,
      invoiceFontFamily: "georgia",
    });
    expect(config.fontFamily).toBe("Times-Roman");
  });

  it("maps courier correctly", () => {
    const config = getInvoiceTemplateConfig({
      ...baseOrg,
      invoiceFontFamily: "courier",
    });
    expect(config.fontFamily).toBe("Courier");
  });

  it("handles invalid template gracefully", () => {
    const config = getInvoiceTemplateConfig({
      ...baseOrg,
      invoiceTemplate: "nonexistent",
    });
    expect(config.template).toBe("modern");
  });

  it("passes through footer text", () => {
    const config = getInvoiceTemplateConfig({
      ...baseOrg,
      invoiceFooterText: "Thank you!",
    });
    expect(config.footerText).toBe("Thank you!");
  });

  it("respects showLogo false", () => {
    const config = getInvoiceTemplateConfig({
      ...baseOrg,
      invoiceShowLogo: false,
    });
    expect(config.showLogo).toBe(false);
  });
});
