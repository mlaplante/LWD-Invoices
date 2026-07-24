import { describe, it, expect, beforeEach } from "vitest";
import { retainersRouter } from "@/server/routers/retainers";
import { createMockContext } from "./mocks/trpc-context";

describe("retainers.deposit", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = retainersRouter.createCaller(ctx);
  });

  it("rejects a clientId belonging to another tenant (cross-org IDOR)", async () => {
    // Retainer.clientId is globally unique, so without the assertInOrg
    // check a caller could upsert a retainer keyed to another org's client.
    ctx.db.client.findFirst.mockResolvedValue(null); // assertInOrg → NOT_FOUND
    await expect(
      caller.deposit({ clientId: "client_other_org", amount: 100 }),
    ).rejects.toThrow(/not found/i);
  });
});
