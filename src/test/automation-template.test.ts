import { describe, it, expect } from "vitest";
import {
  interpolateTemplate,
  AVAILABLE_VARIABLES,
  buildTemplateVariables,
} from "@/server/services/automation-template";

describe("interpolateTemplate", () => {
  it("replaces all known variables", () => {
    const template = "Hi {{clientName}}, invoice {{invoiceNumber}} is due.";
    const result = interpolateTemplate(template, {
      clientName: "Acme Corp",
      invoiceNumber: "INV-001",
    });
    expect(result).toBe("Hi Acme Corp, invoice INV-001 is due.");
  });

  it("handles multiple occurrences of the same variable", () => {
    const template = "{{clientName}} owes. Reminder: {{clientName}}.";
    const result = interpolateTemplate(template, { clientName: "Bob" });
    expect(result).toBe("Bob owes. Reminder: Bob.");
  });

  it("passes through unknown variables", () => {
    const template = "Hello {{unknownVar}}, your {{invoiceNumber}} is ready.";
    const result = interpolateTemplate(template, { invoiceNumber: "INV-100" });
    expect(result).toBe("Hello {{unknownVar}}, your INV-100 is ready.");
  });

  it("handles empty template", () => {
    expect(interpolateTemplate("", { clientName: "Test" })).toBe("");
  });

  it("handles template with no variables", () => {
    expect(interpolateTemplate("No variables here.", {})).toBe("No variables here.");
  });

  it("handles whitespace inside braces", () => {
    const template = "Hi {{ clientName }}, your {{ invoiceNumber }} is due.";
    const result = interpolateTemplate(template, {
      clientName: "Alice",
      invoiceNumber: "INV-200",
    });
    expect(result).toBe("Hi Alice, your INV-200 is due.");
  });

  it("replaces all available variable types", () => {
    const template =
      "{{clientName}} {{invoiceNumber}} {{amountDue}} {{dueDate}} {{paymentLink}} {{orgName}} {{amountPaid}} {{paymentDate}}";
    const result = interpolateTemplate(template, {
      clientName: "C",
      invoiceNumber: "N",
      amountDue: "A",
      dueDate: "D",
      paymentLink: "L",
      orgName: "O",
      amountPaid: "P",
      paymentDate: "PD",
    });
    expect(result).toBe("C N A D L O P PD");
  });
});

describe("AVAILABLE_VARIABLES", () => {
  it("lists all expected variables", () => {
    expect(AVAILABLE_VARIABLES).toContain("clientName");
    expect(AVAILABLE_VARIABLES).toContain("invoiceNumber");
    expect(AVAILABLE_VARIABLES).toContain("amountDue");
    expect(AVAILABLE_VARIABLES).toContain("dueDate");
    expect(AVAILABLE_VARIABLES).toContain("paymentLink");
    expect(AVAILABLE_VARIABLES).toContain("orgName");
    expect(AVAILABLE_VARIABLES).toContain("amountPaid");
    expect(AVAILABLE_VARIABLES).toContain("paymentDate");
    expect(AVAILABLE_VARIABLES).toHaveLength(8);
  });
});

describe("buildTemplateVariables", () => {
  it("builds variables from invoice data", () => {
    const vars = buildTemplateVariables({
      clientName: "Acme Corp",
      invoiceNumber: "INV-001",
      amountDue: "$500.00",
      dueDate: "2026-04-01",
      portalToken: "token123",
      orgName: "My Biz",
      amountPaid: "$200.00",
      paymentDate: "2026-03-15",
    });
    expect(vars.clientName).toBe("Acme Corp");
    expect(vars.invoiceNumber).toBe("INV-001");
    expect(vars.amountDue).toBe("$500.00");
    expect(vars.paymentLink).toContain("/portal/token123");
    expect(vars.orgName).toBe("My Biz");
    expect(vars.amountPaid).toBe("$200.00");
    expect(vars.paymentDate).toBe("2026-03-15");
  });

  it("defaults amountPaid and paymentDate to empty strings", () => {
    const vars = buildTemplateVariables({
      clientName: "Test",
      invoiceNumber: "INV-002",
      amountDue: "$100.00",
      dueDate: "2026-05-01",
      portalToken: "abc",
      orgName: "Org",
    });
    expect(vars.amountPaid).toBe("");
    expect(vars.paymentDate).toBe("");
  });
});
