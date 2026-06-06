import { describe, it, expect, beforeEach } from "vitest";
import { automationRulesRouter } from "@/server/routers/automationRules";
import { createMockContext } from "./mocks/trpc-context";

describe("Automation Rules Router", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    ctx.userRole = "OWNER";
    caller = automationRulesRouter.createCaller(ctx);
  });

  describe("create", () => {
    it("creates a rule with nested conditions and actions", async () => {
      ctx.db.automationRule.create.mockResolvedValue({ id: "rule_1" });
      await caller.create({
        name: "Chase big overdue invoices",
        trigger: "INVOICE_OVERDUE",
        conditionLogic: "AND",
        enabled: true,
        conditions: [{ field: "AMOUNT_DUE", operator: "GT", value: "500" }],
        actions: [{ type: "SEND_EMAIL", config: { subject: "Overdue", body: "Please pay" } }],
      });

      const arg = ctx.db.automationRule.create.mock.calls[0][0];
      expect(arg.data.organizationId).toBe("test-org-123");
      expect(arg.data.conditions.create).toHaveLength(1);
      expect(arg.data.actions.create[0].type).toBe("SEND_EMAIL");
    });

    it("rejects a CONTAINS operator on a numeric field", async () => {
      await expect(
        caller.create({
          name: "bad",
          trigger: "INVOICE_OVERDUE",
          actions: [{ type: "NOTIFY_ADMINS", config: { title: "t", body: "b" } }],
          conditions: [{ field: "TOTAL", operator: "CONTAINS", value: "1" }],
        }),
      ).rejects.toThrow();
      expect(ctx.db.automationRule.create).not.toHaveBeenCalled();
    });

    it("rejects a non-numeric value on a numeric field", async () => {
      await expect(
        caller.create({
          name: "bad",
          trigger: "INVOICE_OVERDUE",
          actions: [{ type: "NOTIFY_ADMINS", config: { title: "t", body: "b" } }],
          conditions: [{ field: "AMOUNT_DUE", operator: "GT", value: "lots" }],
        }),
      ).rejects.toThrow();
    });

    it("rejects an invalid action config", async () => {
      await expect(
        caller.create({
          name: "bad",
          trigger: "INVOICE_SENT",
          conditions: [],
          actions: [{ type: "SEND_EMAIL", config: { subject: "" , body: "b" } }],
        }),
      ).rejects.toThrow();
    });

    it("requires at least one action", async () => {
      await expect(
        caller.create({ name: "no actions", trigger: "INVOICE_SENT", conditions: [], actions: [] }),
      ).rejects.toThrow();
    });
  });

  describe("list", () => {
    it("scopes to the active org", async () => {
      ctx.db.automationRule.findMany.mockResolvedValue([]);
      await caller.list();
      expect(ctx.db.automationRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: "test-org-123" } }),
      );
    });
  });

  describe("update / delete / setEnabled", () => {
    it("404s when updating a rule from another org", async () => {
      ctx.db.automationRule.findFirst.mockResolvedValue(null);
      await expect(
        caller.update({
          id: "rule_x",
          name: "x",
          trigger: "INVOICE_SENT",
          conditions: [],
          actions: [{ type: "NOTIFY_ADMINS", config: { title: "t", body: "b" } }],
        }),
      ).rejects.toThrow(/not found/i);
    });

    it("toggles enabled", async () => {
      ctx.db.automationRule.findFirst.mockResolvedValue({ id: "rule_1" });
      ctx.db.automationRule.update.mockResolvedValue({ id: "rule_1", enabled: false });
      await caller.setEnabled({ id: "rule_1", enabled: false });
      expect(ctx.db.automationRule.update).toHaveBeenCalledWith({
        where: { id: "rule_1" },
        data: { enabled: false },
      });
    });

    it("deletes an owned rule", async () => {
      ctx.db.automationRule.findFirst.mockResolvedValue({ id: "rule_1" });
      ctx.db.automationRule.delete.mockResolvedValue({ id: "rule_1" });
      const res = await caller.delete({ id: "rule_1" });
      expect(res).toEqual({ success: true });
    });
  });

  describe("RBAC", () => {
    it("denies a VIEWER", async () => {
      ctx.userRole = "VIEWER";
      const viewerCaller = automationRulesRouter.createCaller(ctx);
      await expect(viewerCaller.list()).rejects.toThrow();
    });
  });
});
