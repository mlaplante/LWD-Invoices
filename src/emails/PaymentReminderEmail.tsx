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
  dueDate: string;
  orgName: string;
  portalLink: string;
  daysUntilDue: number;
};

export function PaymentReminderEmail({
  invoiceNumber,
  clientName,
  total,
  currencySymbol,
  dueDate,
  orgName,
  portalLink,
  daysUntilDue,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>
        {`Payment reminder — Invoice #${invoiceNumber} due in ${daysUntilDue} ${daysUntilDue === 1 ? "day" : "days"}`}
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
            This is a friendly reminder that invoice #{invoiceNumber} is due in{" "}
            <strong>
              {daysUntilDue} {daysUntilDue === 1 ? "day" : "days"}
            </strong>
            .
          </Text>

          <Container
            style={{
              backgroundColor: "#fffbeb",
              borderRadius: 6,
              padding: "16px 20px",
              margin: "24px 0",
              borderLeft: "4px solid #f59e0b",
            }}
          >
            <Text style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>
              INVOICE NUMBER
            </Text>
            <Text
              style={{ margin: "2px 0 12px", color: "#111827", fontWeight: "bold" }}
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

            <Text style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>
              DUE DATE
            </Text>
            <Text style={{ margin: "2px 0 0", color: "#b45309", fontSize: 14 }}>
              {dueDate}
            </Text>
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
            Pay Invoice
          </Button>

          <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />
          <Text style={{ fontSize: 12, color: "#9ca3af" }}>
            Sent by {orgName} · Powered by LWD Invoices
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default PaymentReminderEmail;
