import { describe, it, expect, beforeEach, vi } from "vitest";
import { logAudit } from "@/server/services/audit";
import { projectsRouter } from "@/server/routers/projects";
import { createMockContext } from "./mocks/trpc-context";

vi.mock("@/server/services/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

describe("projects audit logging", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof projectsRouter.createCaller>;
  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    caller = projectsRouter.createCaller(ctx);
  });

  it("logs CREATED with entityType Project on create", async () => {
    // $transaction mock already invokes the callback with ctx.db (see prisma.ts:367-376)
    ctx.db.project.create.mockResolvedValue({ id: "proj_1", name: "Website" });
    ctx.db.projectTemplate.findUnique.mockResolvedValue(null);

    await caller.create({
      name: "Website",
      clientId: "c1",
      currencyId: "cur1",
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CREATED",
        entityType: "Project",
        entityId: "proj_1",
        entityLabel: "Website",
        organizationId: "test-org-123",
      }),
    );
  });
});
