import { describe, it, expect } from "vitest";
import {
  evaluateCondition,
  evaluateConditions,
  ruleShouldRun,
  operatorsForField,
  isNumericField,
  daysOverdue,
  type AutomationEntity,
  type RuleCondition,
} from "@/server/services/automation-engine";

const entity: AutomationEntity = {
  total: 1000,
  amountDue: 600,
  daysOverdue: 15,
  status: "OVERDUE",
  clientName: "Acme Corp",
  currencyCode: "USD",
};

const cond = (field: RuleCondition["field"], operator: RuleCondition["operator"], value: string): RuleCondition => ({
  field,
  operator,
  value,
});

describe("evaluateCondition — numeric fields", () => {
  it("handles every numeric operator", () => {
    expect(evaluateCondition(cond("TOTAL", "EQ", "1000"), entity)).toBe(true);
    expect(evaluateCondition(cond("TOTAL", "NEQ", "999"), entity)).toBe(true);
    expect(evaluateCondition(cond("AMOUNT_DUE", "GT", "500"), entity)).toBe(true);
    expect(evaluateCondition(cond("AMOUNT_DUE", "GTE", "600"), entity)).toBe(true);
    expect(evaluateCondition(cond("DAYS_OVERDUE", "LT", "30"), entity)).toBe(true);
    expect(evaluateCondition(cond("DAYS_OVERDUE", "LTE", "15"), entity)).toBe(true);
    expect(evaluateCondition(cond("AMOUNT_DUE", "LT", "500"), entity)).toBe(false);
  });

  it("fails closed when a numeric value is non-numeric", () => {
    expect(evaluateCondition(cond("TOTAL", "GT", "abc"), entity)).toBe(false);
  });

  it("never matches a string operator on a numeric field", () => {
    expect(evaluateCondition(cond("TOTAL", "CONTAINS", "100"), entity)).toBe(false);
  });
});

describe("evaluateCondition — string fields", () => {
  it("compares case-insensitively", () => {
    expect(evaluateCondition(cond("STATUS", "EQ", "overdue"), entity)).toBe(true);
    expect(evaluateCondition(cond("CLIENT_NAME", "CONTAINS", "acme"), entity)).toBe(true);
    expect(evaluateCondition(cond("CLIENT_NAME", "NOT_CONTAINS", "globex"), entity)).toBe(true);
    expect(evaluateCondition(cond("CURRENCY_CODE", "NEQ", "EUR"), entity)).toBe(true);
  });

  it("never matches an ordering operator on a string field", () => {
    expect(evaluateCondition(cond("CLIENT_NAME", "GT", "A"), entity)).toBe(false);
  });
});

describe("evaluateConditions — AND/OR", () => {
  it("AND requires all", () => {
    const conds = [cond("AMOUNT_DUE", "GT", "500"), cond("STATUS", "EQ", "OVERDUE")];
    expect(evaluateConditions(conds, "AND", entity)).toBe(true);
    expect(evaluateConditions([...conds, cond("CURRENCY_CODE", "EQ", "EUR")], "AND", entity)).toBe(false);
  });

  it("OR requires any", () => {
    const conds = [cond("CURRENCY_CODE", "EQ", "EUR"), cond("AMOUNT_DUE", "GT", "500")];
    expect(evaluateConditions(conds, "OR", entity)).toBe(true);
    expect(evaluateConditions([cond("CURRENCY_CODE", "EQ", "EUR")], "OR", entity)).toBe(false);
  });

  it("treats an empty condition set as always-true", () => {
    expect(evaluateConditions([], "AND", entity)).toBe(true);
    expect(evaluateConditions([], "OR", entity)).toBe(true);
  });
});

describe("ruleShouldRun", () => {
  it("requires the trigger to match", () => {
    const rule = { trigger: "INVOICE_OVERDUE" as const, conditionLogic: "AND" as const, conditions: [] };
    expect(ruleShouldRun(rule, "INVOICE_OVERDUE", entity)).toBe(true);
    expect(ruleShouldRun(rule, "PAYMENT_RECEIVED", entity)).toBe(false);
  });

  it("combines trigger match with conditions", () => {
    const rule = {
      trigger: "INVOICE_OVERDUE" as const,
      conditionLogic: "AND" as const,
      conditions: [cond("AMOUNT_DUE", "GTE", "1000")],
    };
    expect(ruleShouldRun(rule, "INVOICE_OVERDUE", entity)).toBe(false); // amountDue is 600
  });
});

describe("field/operator metadata", () => {
  it("classifies numeric vs string fields", () => {
    expect(isNumericField("TOTAL")).toBe(true);
    expect(isNumericField("STATUS")).toBe(false);
  });

  it("offers only sensible operators per field type", () => {
    expect(operatorsForField("TOTAL")).toContain("GTE");
    expect(operatorsForField("TOTAL")).not.toContain("CONTAINS");
    expect(operatorsForField("CLIENT_NAME")).toContain("CONTAINS");
    expect(operatorsForField("CLIENT_NAME")).not.toContain("GT");
  });
});

describe("daysOverdue", () => {
  const now = new Date("2026-06-20T00:00:00Z");
  it("floors at zero for not-yet-due or missing due dates", () => {
    expect(daysOverdue(null, now)).toBe(0);
    expect(daysOverdue(new Date("2026-06-25T00:00:00Z"), now)).toBe(0);
  });
  it("counts whole days past due", () => {
    expect(daysOverdue(new Date("2026-06-10T00:00:00Z"), now)).toBe(10);
  });
});
