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
  total: string;
  currencySymbol: string;
  dueDate: string | null;
  orgName: string;
  portalLink: string;
};

export function InvoiceSentEmail({
  invoiceNumber,
  clientName,
  total,
  currencySymbol,
  dueDate,
  orgName,
  portalLink,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>
        Invoice #{invoiceNumber} from {orgName} — {currencySymbol}
        {total}
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
            You have a new invoice from <strong>{orgName}</strong>.
          </Text>

          <Container
            style={{
              backgroundColor: "#f3f4f6",
              borderRadius: 6,
              padding: "16px 20px",
              margin: "24px 0",
            }}
          >
            <Text style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>
              INVOICE NUMBER
            </Text>
            <Text
              style={{
                margin: "2px 0 12px",
                color: "#111827",
                fontWeight: "bold",
                fontSize: 16,
              }}
            >
              #{invoiceNumber}
            </Text>

            <Text style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>
              AMOUNT DUE
            </Text>
            <Text
              style={{
                margin: "2px 0 12px",
                color: "#111827",
                fontWeight: "bold",
                fontSize: 20,
              }}
            >
              {currencySymbol}
              {total}
            </Text>

            {dueDate && (
              <>
                <Text style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>
                  DUE DATE
                </Text>
                <Text style={{ margin: "2px 0 0", color: "#111827", fontSize: 14 }}>
                  {dueDate}
                </Text>
              </>
            )}
          </Container>

          <Button
            href={portalLink}
            style={{
              backgroundColor: "#2563eb",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: 6,
              textDecoration: "none",
              fontWeight: "bold",
              display: "inline-block",
            }}
          >
            View Invoice
          </Button>

          <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />
          <Text style={{ fontSize: 12, color: "#9ca3af" }}>
            Sent by {orgName} · Powered by Pancake
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default InvoiceSentEmail;
