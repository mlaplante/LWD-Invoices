import { describe, it, expect } from "vitest";
import { toggleId, toggleAll, isAllSelected, clearSelection } from "@/lib/bulk-selection";

describe("bulk-selection transitions", () => {
  it("toggleId adds then removes an id", () => {
    const a = toggleId(new Set<string>(), "x");
    expect([...a]).toEqual(["x"]);
    const b = toggleId(a, "x");
    expect([...b]).toEqual([]);
  });

  it("toggleAll selects all when none/partial selected, clears when all selected", () => {
    const ids = ["a", "b", "c"];
    const all = toggleAll(new Set(["a"]), ids);
    expect(isAllSelected(all, ids)).toBe(true);
    const none = toggleAll(all, ids);
    expect(none.size).toBe(0);
  });

  it("isAllSelected is false for an empty id list", () => {
    expect(isAllSelected(new Set(), [])).toBe(false);
  });

  it("clearSelection returns an empty set", () => {
    expect(clearSelection().size).toBe(0);
  });
});
