import { describe, it, expect } from "vitest";

describe("sendEmail", () => {
  it("exports sendEmail function", async () => {
    const mod = await import("@/server/services/email-sender");
    expect(typeof mod.sendEmail).toBe("function");
  });
});
