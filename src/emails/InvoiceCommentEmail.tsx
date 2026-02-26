import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Preview,
} from "@react-email/components";
import React from "react";

type Props = {
  invoiceNumber: string;
  clientName: string;
  authorName: string;
  commentBody: string;
  orgName: string;
  invoiceLink: string;
};

export function InvoiceCommentEmail({
  invoiceNumber,
  clientName,
  authorName,
  commentBody,
  orgName,
  invoiceLink,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>
        {authorName} commented on Invoice #{invoiceNumber}
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
            New comment on Invoice #{invoiceNumber}
          </Text>
          <Text style={{ color: "#374151" }}>
            <strong>{authorName}</strong> ({clientName}) left a comment on Invoice{" "}
            <strong>#{invoiceNumber}</strong>:
          </Text>

          <Section
            style={{
              backgroundColor: "#f3f4f6",
              borderLeft: "4px solid #2563eb",
              borderRadius: 4,
              padding: "12px 16px",
              margin: "16px 0",
            }}
          >
            <Text style={{ color: "#374151", margin: 0, whiteSpace: "pre-wrap" }}>
              {commentBody}
            </Text>
          </Section>

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

export default InvoiceCommentEmail;
