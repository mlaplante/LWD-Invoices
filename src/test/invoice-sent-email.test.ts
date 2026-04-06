import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import { InvoiceSentEmail } from "@/emails/InvoiceSentEmail";

describe("InvoiceSentEmail", () => {
  const baseProps = {
    invoiceNumber: "INV-001",
    clientName: "Jane Doe",
    total: "1500.00",
    currencySymbol: "$",
    dueDate: "April 15, 2026",
    orgName: "Acme Design",
    portalLink: "https://app.example.com/portal/abc123",
    payLink: "https://app.example.com/pay/abc123",
  };

  it("renders a Pay Now button linking to the pay page", async () => {
    const html = await render(InvoiceSentEmail(baseProps));
    // react-email inserts comment nodes between JSX expressions, so check parts separately
    expect(html).toContain("1,500.00");
    expect(html).toContain("Now");
    expect(html).toContain("https://app.example.com/pay/abc123");
  });

  it("renders a secondary View Invoice link to the portal", async () => {
    const html = await render(InvoiceSentEmail(baseProps));
    expect(html).toContain("View full invoice");
    expect(html).toContain("https://app.example.com/portal/abc123");
  });

  it("falls back to View Invoice when no payLink provided", async () => {
    const { payLink, ...noPayLink } = baseProps;
    const html = await render(InvoiceSentEmail(noPayLink));
    expect(html).toContain("View Invoice");
    expect(html).not.toContain("Pay $");
  });
});
