import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted so the vi.mock factories (which are hoisted above imports) can close
// over these without a TDZ error.
const { runRuleActions, automationRun } = vi.hoisted(() => ({
  runRuleActions: vi.fn(),
  automationRun: { findMany: vi.fn(), create: vi.fn() },
}));

// Mock the action runner so we assert evaluation/dedupe without real side effects.
vi.mock("@/server/services/automation-runner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/automation-runner")>();
  return { ...actual, runRuleActions };
});

// Mock the db singleton the inngest function imports.
vi.mock("@/server/db", () => ({ db: { automationRun } }));

import { evaluateRulesForInvoice } from "@/inngest/functions/automation-rules";

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv_1",
    number: "INV-1001",
    total: 1000,
    status: "OVERDUE",
    dueDate: new Date("2026-06-01T00:00:00Z"),
    portalToken: "tok",
    organizationId: "org_1",
    client: { name: "Acme", email: "a@acme.test" },
    organization: { id: "org_1", name: "LWD" },
    currency: { code: "USD" },
    payments: [{ amount: 400, paidAt: new Date("2026-06-05T00:00:00Z") }],
    ...overrides,
  } as never;
}

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule_1",
    trigger: "INVOICE_OVERDUE",
    conditionLogic: "AND",
    conditions: [],
    actions: [{ type: "SEND_EMAIL", config: { subject: "s", body: "b" }, sort: 0 }],
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  automationRun.findMany.mockResolvedValue([]);
  automationRun.create.mockResolvedValue({});
  runRuleActions.mockResolvedValue({ status: "executed", actionsRun: 1 });
});

const now = new Date("2026-06-16T00:00:00Z");

describe("evaluateRulesForInvoice", () => {
  it("runs a matching rule and logs the run", async () => {
    const stats = { matched: 0, ran: 0, skipped: 0, failed: 0 };
    await evaluateRulesForInvoice([makeRule()], makeInvoice(), "INVOICE_OVERDUE", now, stats);

    expect(runRuleActions).toHaveBeenCalledTimes(1);
    expect(automationRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ruleId: "rule_1", invoiceId: "inv_1", status: "executed" }),
      }),
    );
    expect(stats).toMatchObject({ matched: 1, ran: 1, skipped: 0, failed: 0 });
  });

  it("skips a rule whose conditions don't match", async () => {
    const rule = makeRule({ conditions: [{ field: "AMOUNT_DUE", operator: "GT", value: "5000" }] });
    const stats = { matched: 0, ran: 0, skipped: 0, failed: 0 };
    await evaluateRulesForInvoice([rule], makeInvoice(), "INVOICE_OVERDUE", now, stats);

    expect(runRuleActions).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ matched: 0, skipped: 1 });
  });

  it("does not re-run a rule that already has a run for the invoice", async () => {
    automationRun.findMany.mockResolvedValue([{ ruleId: "rule_1" }]);
    const stats = { matched: 0, ran: 0, skipped: 0, failed: 0 };
    await evaluateRulesForInvoice([makeRule()], makeInvoice(), "INVOICE_OVERDUE", now, stats);

    expect(runRuleActions).not.toHaveBeenCalled();
    expect(automationRun.create).not.toHaveBeenCalled();
    expect(stats.skipped).toBe(1);
  });

  it("ignores rules whose trigger differs from the fired one", async () => {
    const stats = { matched: 0, ran: 0, skipped: 0, failed: 0 };
    await evaluateRulesForInvoice([makeRule({ trigger: "PAYMENT_RECEIVED" })], makeInvoice(), "INVOICE_OVERDUE", now, stats);
    expect(runRuleActions).not.toHaveBeenCalled();
    expect(stats.skipped).toBe(1);
  });

  it("counts a failed action run as failed", async () => {
    runRuleActions.mockResolvedValue({ status: "failed", actionsRun: 0, detail: "boom" });
    const stats = { matched: 0, ran: 0, skipped: 0, failed: 0 };
    await evaluateRulesForInvoice([makeRule()], makeInvoice(), "INVOICE_OVERDUE", now, stats);
    expect(stats).toMatchObject({ matched: 1, ran: 0, failed: 1 });
  });
});
