import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmail = vi.fn();
const notifyOrgAdmins = vi.fn();
vi.mock("@/server/services/email-sender", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock("@/server/services/notifications", () => ({ notifyOrgAdmins: (...a: unknown[]) => notifyOrgAdmins(...a) }));

import {
  buildAutomationEntity,
  parseActionConfig,
  runRuleActions,
  type RunnerInvoice,
} from "@/server/services/automation-runner";

const invoice: RunnerInvoice = {
  id: "inv_1",
  number: "INV-1001",
  total: 1000,
  status: "OVERDUE",
  dueDate: new Date("2026-06-01T00:00:00Z"),
  portalToken: "tok_abc",
  client: { id: "client_1", name: "Acme Corp", email: "ar@acme.test" },
  organization: { id: "org_1", name: "LWD" },
  currency: { code: "USD" },
  payments: [{ amount: 400, paidAt: new Date("2026-06-05T00:00:00Z") }],
};

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue({ ok: true });
  notifyOrgAdmins.mockResolvedValue(undefined);
});

describe("buildAutomationEntity", () => {
  it("computes balance due and days overdue from the invoice", () => {
    const entity = buildAutomationEntity(invoice, new Date("2026-06-16T00:00:00Z"));
    expect(entity.total).toBe(1000);
    expect(entity.amountDue).toBe(600); // 1000 - 400 paid
    expect(entity.daysOverdue).toBe(15);
    expect(entity.status).toBe("OVERDUE");
    expect(entity.clientName).toBe("Acme Corp");
    expect(entity.currencyCode).toBe("USD");
  });

  it("never reports a negative balance when overpaid", () => {
    const entity = buildAutomationEntity(
      { ...invoice, payments: [{ amount: 1500, paidAt: new Date() }] },
      new Date(),
    );
    expect(entity.amountDue).toBe(0);
  });
});

describe("parseActionConfig", () => {
  it("accepts valid configs and rejects invalid ones", () => {
    expect(parseActionConfig("SEND_EMAIL", { subject: "Hi", body: "Body" })).toBeTruthy();
    expect(parseActionConfig("NOTIFY_ADMINS", { title: "T", body: "B" })).toBeTruthy();
    expect(() => parseActionConfig("SEND_EMAIL", { subject: "" })).toThrow();
    expect(() => parseActionConfig("NOTIFY_ADMINS", { foo: "bar" })).toThrow();
  });
});

describe("runRuleActions", () => {
  const now = new Date("2026-06-16T00:00:00Z");

  it("sends an email with interpolated template variables", async () => {
    const result = await runRuleActions(
      [{ type: "SEND_EMAIL", config: { subject: "Invoice {{invoiceNumber}}", body: "Hi {{clientName}}, pay {{paymentUrl}}" } }],
      invoice,
      now,
    );

    expect(result.status).toBe("executed");
    expect(result.actionsRun).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0][0];
    expect(arg.to).toBe("ar@acme.test");
    expect(arg.subject).toBe("Invoice INV-1001");
    expect(arg.html).toContain("Hi Acme Corp");
    expect(arg.html).toContain("/portal/tok_abc");
    expect(arg.invoiceId).toBe("inv_1");
  });

  it("notifies admins for a NOTIFY_ADMINS action", async () => {
    const result = await runRuleActions(
      [{ type: "NOTIFY_ADMINS", config: { title: "Overdue {{invoiceNumber}}", body: "Chase {{clientName}}" } }],
      invoice,
      now,
    );
    expect(result.status).toBe("executed");
    expect(notifyOrgAdmins).toHaveBeenCalledWith(
      "org_1",
      expect.objectContaining({ type: "AUTOMATION_TRIGGERED", title: "Overdue INV-1001", body: "Chase Acme Corp" }),
    );
  });

  it("reports failed when an email action has no recipient", async () => {
    const result = await runRuleActions(
      [{ type: "SEND_EMAIL", config: { subject: "s", body: "b" } }],
      { ...invoice, client: { id: "client_1", name: "Acme", email: null } },
      now,
    );
    expect(result.status).toBe("failed");
    expect(result.actionsRun).toBe(0);
    expect(result.detail).toContain("no email");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("reports partial when one of several actions fails", async () => {
    const result = await runRuleActions(
      [
        { type: "NOTIFY_ADMINS", config: { title: "t", body: "b" } },
        { type: "SEND_EMAIL", config: { subject: "s", body: "b" } },
      ],
      { ...invoice, client: { id: "client_1", name: "Acme", email: null } },
      now,
    );
    expect(result.status).toBe("partial");
    expect(result.actionsRun).toBe(1);
    expect(notifyOrgAdmins).toHaveBeenCalledTimes(1);
  });
});
