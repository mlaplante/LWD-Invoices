import { describe, expect, it } from "vitest";
import { prefillAllocation } from "@/components/reconciliation/allocation";

describe("prefillAllocation", () => {
  it("uses the smaller of invoice balance and remaining funds", () => {
    expect(prefillAllocation(120, 80)).toBe(80);
    expect(prefillAllocation(40, 80)).toBe(40);
  });

  it("never allocates a negative amount", () => {
    expect(prefillAllocation(40, -1)).toBe(0);
  });
});
