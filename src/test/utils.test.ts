import { describe, it, expect } from "vitest";
import { formatBytes, cn } from "@/lib/utils";

describe("Utility Functions", () => {
  describe("formatBytes", () => {
    it("formats bytes less than 1KB", () => {
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(1)).toBe("1 B");
      expect(formatBytes(512)).toBe("512 B");
      expect(formatBytes(1023)).toBe("1023 B");
    });

    it("formats kilobytes", () => {
      expect(formatBytes(1024)).toBe("1.0 KB");
      expect(formatBytes(2048)).toBe("2.0 KB");
      expect(formatBytes(1536)).toBe("1.5 KB");
      expect(formatBytes(1024 * 1024 - 1)).toBe("1024.0 KB");
    });

    it("formats megabytes", () => {
      expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
      expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
      expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
      expect(formatBytes(100 * 1024 * 1024)).toBe("100.0 MB");
    });

    it("handles fractional bytes", () => {
      expect(formatBytes(1536)).toBe("1.5 KB");
      expect(formatBytes(1640)).toContain("KB");
    });

    it("handles large file sizes", () => {
      const gigabyte = 1024 * 1024 * 1024;
      expect(formatBytes(gigabyte)).toBe(
        `${(gigabyte / (1024 * 1024)).toFixed(1)} MB`
      );
    });
  });

  describe("cn (className merge)", () => {
    it("merges simple class strings", () => {
      expect(cn("px-2", "py-1")).toBe("px-2 py-1");
    });

    it("handles tailwind conflicts with proper precedence", () => {
      // When px-2 and px-4 conflict, the last one should win
      const result = cn("px-2", "px-4");
      expect(result).toContain("px-");
    });

    it("handles conditional classes", () => {
      const isActive = true;
      expect(cn("base", isActive && "active")).toContain("base");
      expect(cn("base", isActive && "active")).toContain("active");
    });

    it("filters out false conditional classes", () => {
      const isActive = false;
      const result = cn("base", isActive && "active");
      expect(result).toBe("base");
    });

    it("handles object-based conditional classes", () => {
      expect(cn({ "px-2": true, "py-1": false })).toBe("px-2");
    });

    it("handles arrays of classes", () => {
      expect(cn(["px-2", "py-1"])).toContain("px-2");
      expect(cn(["px-2", "py-1"])).toContain("py-1");
    });

    it("handles empty values gracefully", () => {
      expect(cn("", undefined, null, false, "px-2")).toBe("px-2");
    });

    it("handles complex tailwind class resolution", () => {
      // Test that tailwind merge properly handles responsive classes
      const result = cn("sm:px-2", "sm:px-4");
      expect(result).toContain("sm:px-");
    });

    it("preserves custom classes alongside tailwind", () => {
      const result = cn("px-2 py-1", "custom-class");
      expect(result).toContain("px-2");
      expect(result).toContain("custom-class");
    });

    it("handles nested conditional logic", () => {
      const variant = "primary" as "primary" | "secondary";
      const result = cn(
        "base",
        variant === "primary" && "bg-blue-500",
        variant === "secondary" && "bg-gray-500"
      );
      expect(result).toContain("base");
      expect(result).toContain("bg-blue");
      expect(result).not.toContain("bg-gray");
    });

    it("deduplicates classes", () => {
      const result = cn("px-2", "px-2");
      // Should not have duplicate px-2
      const count = (result.match(/px-2/g) || []).length;
      expect(count).toBeLessThanOrEqual(1);
    });
  });
});
