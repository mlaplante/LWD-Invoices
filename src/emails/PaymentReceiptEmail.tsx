import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Hr,
  Preview,
} from "@react-email/components";
import React from "react";

type Props = {
  invoiceNumber: string;
  clientName: string;
  amountPaid: string;
  currencySymbol: string;
  paidAt: string;
  orgName: string;
};

export function PaymentReceiptEmail({
  invoiceNumber,
  clientName,
  amountPaid,
  currencySymbol,
  paidAt,
  orgName,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>
        Payment received — Invoice #{invoiceNumber}
      </Preview>
      <Body style={{ backgroundColor: "#f9fafb", fontFamily: "sans-serif" }}>
        <Container
          style={{
            maxWidth: 600,
            margin: "40px auto",
            backgroundColor: "#fff",
            borderRadius: 8,
            padding: 32,
            border: "1px solid #e5e7eb",
          }}
        >
          <Text
            style={{ fontSize: 22, fontWeight: "bold", color: "#111827", marginBottom: 4 }}
          >
            {orgName}
          </Text>
          <Hr style={{ borderColor: "#e5e7eb", margin: "16px 0" }} />

          <Text style={{ fontSize: 16, color: "#111827" }}>
            Hi {clientName},
          </Text>
          <Text style={{ color: "#374151" }}>
            We have received your payment. Thank you!
          </Text>

          <Container
            style={{
              backgroundColor: "#f0fdf4",
              borderRadius: 6,
              padding: "16px 20px",
              margin: "24px 0",
              borderLeft: "4px solid #22c55e",
            }}
          >
            <Text style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>
              INVOICE
            </Text>
            <Text style={{ margin: "2px 0 12px", color: "#111827", fontWeight: "bold" }}>
              #{invoiceNumber}
            </Text>

            <Text style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>
              AMOUNT PAID
            </Text>
            <Text
              style={{
                margin: "2px 0 12px",
                color: "#15803d",
                fontWeight: "bold",
                fontSize: 20,
              }}
            >
              {currencySymbol}
              {amountPaid}
            </Text>

            <Text style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>
              DATE
            </Text>
            <Text style={{ margin: "2px 0 0", color: "#111827", fontSize: 14 }}>
              {paidAt}
            </Text>
          </Container>

          <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />
          <Text style={{ fontSize: 12, color: "#9ca3af" }}>
            Sent by {orgName} · Powered by LWD Invoices
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default PaymentReceiptEmail;
