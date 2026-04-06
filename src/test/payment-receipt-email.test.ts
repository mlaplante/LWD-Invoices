import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import { PaymentReceiptEmail } from "@/emails/PaymentReceiptEmail";

describe("PaymentReceiptEmail", () => {
  const baseProps = {
    invoiceNumber: "INV-042",
    clientName: "Bob Builder",
    amountPaid: "500.00",
    currencySymbol: "$",
    paidAt: "April 5, 2026",
    orgName: "Creative Studio",
    portalLink: "https://app.example.com/portal/xyz",
  };

  it("shows View Receipt when fully paid (no remaining balance)", async () => {
    const html = await render(PaymentReceiptEmail(baseProps));
    expect(html).toContain("View Receipt");
    expect(html).not.toContain("Pay Remaining");
  });

  it("shows Pay Remaining button when there is a remaining balance", async () => {
    const html = await render(
      PaymentReceiptEmail({
        ...baseProps,
        remainingBalance: "1000.00",
        payLink: "https://app.example.com/pay/xyz",
      })
    );
    expect(html).toContain("Pay Remaining");
    expect(html).toContain("https://app.example.com/pay/xyz");
  });

  it("still shows View Receipt as secondary link when partially paid", async () => {
    const html = await render(
      PaymentReceiptEmail({
        ...baseProps,
        remainingBalance: "1000.00",
        payLink: "https://app.example.com/pay/xyz",
      })
    );
    expect(html).toContain("View Receipt");
  });
});
