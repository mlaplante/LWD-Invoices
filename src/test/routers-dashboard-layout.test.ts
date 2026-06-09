import { describe, it, expect, beforeEach } from "vitest";
import { dashboardLayoutRouter } from "@/server/routers/dashboardLayout";
import { createMockContext } from "./mocks/trpc-context";

describe("dashboardLayout router", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof dashboardLayoutRouter.createCaller>;
  beforeEach(() => {
    ctx = createMockContext();
    caller = dashboardLayoutRouter.createCaller(ctx);
  });

  it("get returns the default layout when none saved", async () => {
    ctx.db.userDashboardPreference.findUnique.mockResolvedValue(null);
    const result = await caller.get();
    expect(result.map((w: { key: string }) => w.key)).toContain("cashFlow");
    expect(result.every((w: { visible: boolean }) => w.visible)).toBe(true);
  });

  it("get normalizes a stored layout (drops unknown keys)", async () => {
    ctx.db.userDashboardPreference.findUnique.mockResolvedValue({
      layoutJson: JSON.stringify([{ key: "revenue", visible: false }, { key: "junk", visible: true }]),
    });
    const result = await caller.get();
    expect(result.find((w: { key: string }) => w.key === "junk")).toBeUndefined();
    expect(result.find((w: { key: string }) => w.key === "revenue")).toMatchObject({ visible: false });
  });

  it("save upserts scoped to (user, org) and rejects unknown keys", async () => {
    ctx.db.userDashboardPreference.upsert.mockResolvedValue({});
    await caller.save({ layout: [{ key: "expenses", visible: true }] });
    expect(ctx.db.userDashboardPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_organizationId: { userId: "test-user-456", organizationId: "test-org-123" } },
      }),
    );
    await expect(
      // @ts-expect-error invalid key must be rejected by the Zod enum
      caller.save({ layout: [{ key: "junk", visible: true }] }),
    ).rejects.toThrow();
  });
});
