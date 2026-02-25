import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Button,
  Hr,
  Preview,
} from "@react-email/components";
import React from "react";

type Props = {
  invoiceNumber: string;
  clientName: string;
  orgName: string;
  invoiceLink: string;
  viewedAt: string;
};

export function InvoiceViewedEmail({
  invoiceNumber,
  clientName,
  orgName,
  invoiceLink,
  viewedAt,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>
        {clientName} viewed Invoice #{invoiceNumber}
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
            Invoice viewed
          </Text>
          <Text style={{ color: "#374151" }}>
            <strong>{clientName}</strong> opened Invoice{" "}
            <strong>#{invoiceNumber}</strong> at {viewedAt}.
          </Text>

          <Button
            href={invoiceLink}
            style={{
              backgroundColor: "#2563eb",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: 6,
              textDecoration: "none",
              fontWeight: "bold",
              display: "inline-block",
              marginTop: 8,
            }}
          >
            View Invoice
          </Button>

          <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />
          <Text style={{ fontSize: 12, color: "#9ca3af" }}>
            {orgName} · Powered by LWD Invoices
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default InvoiceViewedEmail;
