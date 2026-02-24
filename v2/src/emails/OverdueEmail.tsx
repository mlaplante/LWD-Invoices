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
  daysOverdue: number;
  orgName: string;
  portalLink: string;
};

export function OverdueEmail({
  invoiceNumber,
  clientName,
  total,
  currencySymbol,
  dueDate,
  daysOverdue,
  orgName,
  portalLink,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>
        {`OVERDUE — Invoice #${invoiceNumber} was due ${daysOverdue} ${daysOverdue === 1 ? "day" : "days"} ago`}
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
            Invoice #{invoiceNumber} is now{" "}
            <strong style={{ color: "#dc2626" }}>
              {daysOverdue} {daysOverdue === 1 ? "day" : "days"} overdue
            </strong>
            . Please arrange payment at your earliest convenience.
          </Text>

          <Container
            style={{
              backgroundColor: "#fef2f2",
              borderRadius: 6,
              padding: "16px 20px",
              margin: "24px 0",
              borderLeft: "4px solid #dc2626",
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
              AMOUNT OVERDUE
            </Text>
            <Text
              style={{
                margin: "2px 0 12px",
                color: "#dc2626",
                fontWeight: "bold",
                fontSize: 20,
              }}
            >
              {currencySymbol}
              {total}
            </Text>

            <Text style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>
              WAS DUE
            </Text>
            <Text style={{ margin: "2px 0 0", color: "#dc2626", fontSize: 14 }}>
              {dueDate}
            </Text>
          </Container>

          <Button
            href={portalLink}
            style={{
              backgroundColor: "#dc2626",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: 6,
              textDecoration: "none",
              fontWeight: "bold",
              display: "inline-block",
            }}
          >
            Pay Now
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

export default OverdueEmail;
