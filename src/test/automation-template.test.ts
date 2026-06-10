import { describe, it, expect } from "vitest";
import {
  interpolateTemplate,
  AVAILABLE_VARIABLES,
  buildTemplateVariables,
  escapeHtml,
  renderTemplateHtml,
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
      "{{clientName}} {{invoiceNumber}} {{amountDue}} {{dueDate}} {{paymentLink}} {{paymentUrl}} {{orgName}} {{amountPaid}} {{paymentDate}}";
    const result = interpolateTemplate(template, {
      clientName: "C",
      invoiceNumber: "N",
      amountDue: "A",
      dueDate: "D",
      paymentLink: "L",
      paymentUrl: "U",
      orgName: "O",
      amountPaid: "P",
      paymentDate: "PD",
    });
    expect(result).toBe("C N A D L U O P PD");
  });
});

describe("AVAILABLE_VARIABLES", () => {
  it("lists all expected variables", () => {
    expect(AVAILABLE_VARIABLES).toContain("clientName");
    expect(AVAILABLE_VARIABLES).toContain("invoiceNumber");
    expect(AVAILABLE_VARIABLES).toContain("amountDue");
    expect(AVAILABLE_VARIABLES).toContain("dueDate");
    expect(AVAILABLE_VARIABLES).toContain("paymentLink");
    expect(AVAILABLE_VARIABLES).toContain("paymentUrl");
    expect(AVAILABLE_VARIABLES).toContain("orgName");
    expect(AVAILABLE_VARIABLES).toContain("amountPaid");
    expect(AVAILABLE_VARIABLES).toContain("paymentDate");
    expect(AVAILABLE_VARIABLES).toHaveLength(9);
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
    expect(vars.paymentUrl).toBe(vars.paymentLink);
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

describe("escapeHtml", () => {
  it("escapes all HTML-significant characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});

describe("renderTemplateHtml", () => {
  it("neutralizes HTML in the stored template body (email XSS)", () => {
    const html = renderTemplateHtml(
      `<img src=x onerror="fetch('//evil')">Hi {{clientName}}`,
      { clientName: "Bob" },
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("Hi Bob");
  });

  it("neutralizes HTML smuggled through interpolated variables", () => {
    const html = renderTemplateHtml("Hi {{clientName}}", {
      clientName: `<script>alert(1)</script>`,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("linkifies the interpolated payment link and converts newlines", () => {
    const html = renderTemplateHtml("Pay here:\n{{paymentLink}}", {
      paymentLink: "https://app.example.com/portal/tok123",
    });
    expect(html).toContain(
      `<a href="https://app.example.com/portal/tok123">https://app.example.com/portal/tok123</a>`,
    );
    expect(html).toContain("<br>");
  });
});
