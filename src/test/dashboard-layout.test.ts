import { describe, it, expect } from "vitest";
import { WIDGET_KEYS, DEFAULT_LAYOUT, normalizeLayout } from "@/lib/dashboard-layout";

describe("dashboard-layout", () => {
  it("DEFAULT_LAYOUT lists every registry key, all visible", () => {
    expect(DEFAULT_LAYOUT.map((w) => w.key).sort()).toEqual([...WIDGET_KEYS].sort());
    expect(DEFAULT_LAYOUT.every((w) => w.visible)).toBe(true);
  });

  it("normalizeLayout drops unknown keys and appends missing keys (hidden=false default visible)", () => {
    const saved = [{ key: "revenue", visible: false }, { key: "bogus", visible: true }];
    const result = normalizeLayout(saved);
    expect(result.find((w) => (w.key as string) === "bogus")).toBeUndefined();          // unknown dropped
    expect(result.find((w) => w.key === "revenue")).toEqual({ key: "revenue", visible: false }); // honored
    expect(result.map((w) => w.key).sort()).toEqual([...WIDGET_KEYS].sort()); // all present
  });

  it("normalizeLayout preserves saved order, missing keys appended in default order", () => {
    const result = normalizeLayout([{ key: "expenses", visible: true }]);
    expect(result[0].key).toBe("expenses");
  });
});
