import { beforeEach, describe, expect, it, vi } from "vitest";
import { TriageCategory } from "@/generated/prisma";
import { replyTriageRouter } from "@/server/routers/replyTriage";
import { createMockContext } from "./mocks/trpc-context";

vi.mock("@/server/services/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

describe("replyTriage router", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    ctx.db.inboundEmailTriage = { findMany: vi.fn(), updateMany: vi.fn() };
    caller = replyTriageRouter.createCaller(ctx);
  });

  it("lists only this org's active triage rows, with category filtering", async () => {
    ctx.db.inboundEmailTriage.findMany.mockResolvedValue([]);

    await expect(caller.list({ category: [TriageCategory.DISPUTE] })).resolves.toEqual([]);
    expect(ctx.db.inboundEmailTriage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: "test-org-123", category: { in: [TriageCategory.DISPUTE] }, isDismissed: false },
      take: 50,
    }));
  });

  it("includes dismissed rows only when requested", async () => {
    ctx.db.inboundEmailTriage.findMany.mockResolvedValue([]);

    await caller.list({ includeDismissed: true });
    expect(ctx.db.inboundEmailTriage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: "test-org-123" }, take: 50,
    }));
  });

  it("allows admins to dismiss and undismiss, and blocks viewers", async () => {
    ctx.db.inboundEmailTriage.updateMany.mockResolvedValue({ count: 1 });

    await caller.dismiss({ id: "triage_1" });
    expect(ctx.db.inboundEmailTriage.updateMany).toHaveBeenLastCalledWith({
      where: { id: "triage_1", organizationId: "test-org-123" }, data: { isDismissed: true },
    });
    await caller.undismiss({ id: "triage_1" });
    expect(ctx.db.inboundEmailTriage.updateMany).toHaveBeenLastCalledWith({
      where: { id: "triage_1", organizationId: "test-org-123" }, data: { isDismissed: false },
    });

    const viewerCtx: any = createMockContext({ userRole: "VIEWER" });
    viewerCtx.db.inboundEmailTriage = { updateMany: vi.fn() };
    const viewer = replyTriageRouter.createCaller(viewerCtx);
    await expect(viewer.dismiss({ id: "triage_1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(viewer.undismiss({ id: "triage_1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("recategorizes as a manual, fully confident override", async () => {
    ctx.db.inboundEmailTriage.updateMany.mockResolvedValue({ count: 1 });

    await caller.recategorize({ id: "triage_1", category: TriageCategory.QUESTION });
    expect(ctx.db.inboundEmailTriage.updateMany).toHaveBeenCalledWith({
      where: { id: "triage_1", organizationId: "test-org-123" },
      data: { category: TriageCategory.QUESTION, source: "manual", confidence: 1, reasoning: "Set manually" },
    });
  });
});
