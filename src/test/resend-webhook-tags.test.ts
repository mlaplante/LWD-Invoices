import { vi, describe, it, expect } from "vitest";

// The route imports the (server-only) db module at load; mock it so importing
// the pure tag helper under test doesn't pull in a real Prisma client.
vi.mock("@/server/db", () => ({ db: {} }));

import { readTagValue } from "@/app/api/webhooks/resend/route";

describe("readTagValue", () => {
  it("reads a value from the array tag shape", () => {
    const tags = [
      { name: "org_id", value: "org_123" },
      { name: "invoice_id", value: "inv_456" },
    ];
    expect(readTagValue(tags, "org_id")).toBe("org_123");
    expect(readTagValue(tags, "invoice_id")).toBe("inv_456");
  });

  it("reads a value from the object tag shape", () => {
    const tags = { org_id: "org_123", invoice_id: "inv_456" };
    expect(readTagValue(tags, "invoice_id")).toBe("inv_456");
  });

  it("returns null for a missing tag", () => {
    expect(readTagValue([{ name: "org_id", value: "x" }], "invoice_id")).toBeNull();
    expect(readTagValue({ org_id: "x" }, "invoice_id")).toBeNull();
  });

  it("returns null when tags are undefined", () => {
    expect(readTagValue(undefined, "org_id")).toBeNull();
  });

  it("returns null when an object tag value is not a string", () => {
    const tags = { invoice_id: 123 as unknown as string };
    expect(readTagValue(tags, "invoice_id")).toBeNull();
  });
});
