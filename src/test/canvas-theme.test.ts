import { describe, it, expect } from "vitest";
import { buildCanvasTheme } from "@/components/invoices/canvas/canvas-theme";

const base = {
  fontFamily: "Helvetica",
  accentColor: "#123456",
  showLogo: true,
  footerText: null,
} as const;

describe("buildCanvasTheme", () => {
  it("maps react-pdf font names to CSS stacks", () => {
    expect(
      buildCanvasTheme({ ...base, template: "modern" }).cssVars["--canvas-font"],
    ).toContain("Helvetica");
    expect(
      buildCanvasTheme({ ...base, template: "classic", fontFamily: "Times-Roman" })
        .cssVars["--canvas-font"],
    ).toContain("Georgia");
    expect(
      buildCanvasTheme({ ...base, template: "minimal", fontFamily: "Courier" })
        .cssVars["--canvas-font"],
    ).toContain("Courier");
  });

  it("passes accent color through as a CSS var", () => {
    expect(
      buildCanvasTheme({ ...base, template: "modern" }).cssVars["--canvas-accent"],
    ).toBe("#123456");
  });

  it("maps template to header style and density", () => {
    expect(buildCanvasTheme({ ...base, template: "modern" })).toMatchObject({
      headerStyle: "banded",
      density: "normal",
    });
    expect(buildCanvasTheme({ ...base, template: "classic" })).toMatchObject({
      headerStyle: "ruled",
      density: "normal",
    });
    expect(buildCanvasTheme({ ...base, template: "minimal" })).toMatchObject({
      headerStyle: "plain",
      density: "normal",
    });
    expect(buildCanvasTheme({ ...base, template: "compact" })).toMatchObject({
      headerStyle: "ruled",
      density: "compact",
    });
  });
});
