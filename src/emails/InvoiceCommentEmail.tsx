import {
  Html, Head, Body, Container, Section,
  Text, Button, Hr, Img, Preview,
} from "@react-email/components";
import React from "react";

type Props = {
  invoiceNumber: string;
  clientName: string;
  authorName: string;
  commentBody: string;
  orgName: string;
  invoiceLink: string;
  logoUrl?: string;
};

const ACCENT = "#0284c7";

export function InvoiceCommentEmail({
  invoiceNumber, clientName, authorName, commentBody, orgName, invoiceLink, logoUrl,
}: Props) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`${authorName} commented on Invoice #${invoiceNumber}`}</Preview>
      <Body style={{ backgroundColor: "#f0efe9", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
        <Container style={{ maxWidth: 580, margin: "32px auto", backgroundColor: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb" }}>

          <Section style={{ backgroundColor: "#0f1628", padding: "28px 32px", textAlign: "center" }}>
            {logoUrl ? (
              <Img src={logoUrl} alt={orgName} width={200} height={40} style={{ maxWidth: 200, maxHeight: 40, height: "auto", margin: "0 auto" }} />
            ) : (
              <Text style={{ color: "#ffffff", fontSize: 22, fontWeight: "bold", fontFamily: "Georgia, 'Times New Roman', Times, serif", margin: 0, letterSpacing: "-0.5px" }}>
                {orgName}
              </Text>
            )}
            <Text style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.15em", margin: "8px 0 0", textTransform: "uppercase" }}>
              New Comment
            </Text>
          </Section>

          <Section style={{ backgroundColor: ACCENT, lineHeight: "4px", fontSize: "4px" }}>&nbsp;</Section>

          <Section style={{ padding: "32px 40px" }}>
            <Text style={{ fontSize: 16, color: "#0f1628", fontWeight: "600", margin: "0 0 8px" }}>
              Comment on Invoice #{invoiceNumber}
            </Text>
            <Text style={{ color: "#4b5563", fontSize: 15, lineHeight: "1.6", margin: "0 0 20px" }}>
              <strong>{authorName}</strong> ({clientName}) left a comment:
            </Text>

            <Section style={{ backgroundColor: "#f0f7ff", borderLeft: `3px solid ${ACCENT}`, borderRadius: "0 6px 6px 0", padding: "16px 20px", margin: "0 0 28px" }}>
              {commentBody.split("\n").map((line, i) => (
                <Text key={i} style={{ color: "#1e3a5f", fontSize: 15, lineHeight: "1.7", fontStyle: "italic", margin: i === 0 ? 0 : "4px 0 0" }}>
                  {line || "\u00A0"}
                </Text>
              ))}
            </Section>

            <Button
              href={invoiceLink}
              style={{ backgroundColor: ACCENT, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
            >
              View &amp; Reply
            </Button>
          </Section>

          <Hr style={{ borderColor: "#f3f4f6", margin: 0 }} />
          <Section style={{ padding: "20px 40px", textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
              {orgName} · Powered by Pancake
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}

export default InvoiceCommentEmail;
