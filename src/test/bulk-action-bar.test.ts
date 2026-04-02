// src/test/bulk-action-bar.test.ts
import { describe, it, expect } from "vitest";

type BulkResult = { succeeded: number; failed: number; skipped: number; errors: string[] };

export function formatBulkResultMessage(
  action: string,
  result: BulkResult
): { message: string; isError: boolean } {
  const total = result.succeeded + result.failed + result.skipped;
  if (result.failed === 0 && result.skipped === 0) {
    return {
      message: `${result.succeeded} invoice${result.succeeded !== 1 ? "s" : ""} ${action}`,
      isError: false,
    };
  }
  const parts: string[] = [];
  if (result.succeeded > 0) parts.push(`${result.succeeded} ${action}`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  return {
    message: parts.join(", "),
    isError: result.failed > 0,
  };
}

describe("formatBulkResultMessage", () => {
  it("formats all-success message", () => {
    const result = formatBulkResultMessage("sent", { succeeded: 5, failed: 0, skipped: 0, errors: [] });
    expect(result.message).toBe("5 invoices sent");
    expect(result.isError).toBe(false);
  });

  it("formats singular message", () => {
    const result = formatBulkResultMessage("sent", { succeeded: 1, failed: 0, skipped: 0, errors: [] });
    expect(result.message).toBe("1 invoice sent");
    expect(result.isError).toBe(false);
  });

  it("formats partial failure message", () => {
    const result = formatBulkResultMessage("sent", { succeeded: 5, failed: 2, skipped: 0, errors: ["err"] });
    expect(result.message).toBe("5 sent, 2 failed");
    expect(result.isError).toBe(true);
  });

  it("formats skipped-only message", () => {
    const result = formatBulkResultMessage("sent", { succeeded: 0, failed: 0, skipped: 3, errors: [] });
    expect(result.message).toBe("3 skipped");
    expect(result.isError).toBe(false);
  });

  it("formats mixed result", () => {
    const result = formatBulkResultMessage("sent", { succeeded: 3, failed: 1, skipped: 2, errors: ["err"] });
    expect(result.message).toBe("3 sent, 1 failed, 2 skipped");
    expect(result.isError).toBe(true);
  });
});
