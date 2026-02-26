import {
  Html, Head, Body, Container, Section, Row, Column,
  Text, Button, Hr, Img, Preview,
} from "@react-email/components";
import React from "react";

type Props = {
  invoiceNumber: string;
  clientName: string;
  orgName: string;
  invoiceLink: string;
  viewedAt: string;
  total?: string;
  currencySymbol?: string;
  logoUrl?: string;
};

const ACCENT = "#7c3aed";

export function InvoiceViewedEmail({
  invoiceNumber, clientName, orgName, invoiceLink, viewedAt, total, currencySymbol, logoUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{`${clientName} viewed Invoice #${invoiceNumber}${total ? ` · ${currencySymbol}${total}` : ""}`}</Preview>
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
              Invoice Activity
            </Text>
          </Section>

          <Section style={{ backgroundColor: ACCENT, lineHeight: "4px", fontSize: "4px" }}>&nbsp;</Section>

          <Section style={{ padding: "32px 40px" }}>
            <Text style={{ fontSize: 16, color: "#0f1628", fontWeight: "600", margin: "0 0 8px" }}>
              Invoice viewed
            </Text>
            <Text style={{ color: "#4b5563", fontSize: 15, lineHeight: "1.6", margin: "0 0 24px" }}>
              <strong>{clientName}</strong> opened Invoice <strong>#{invoiceNumber}</strong> on {viewedAt}.
            </Text>

            <Section style={{ backgroundColor: "#f8f8f7", borderRadius: 8, padding: "20px 24px", margin: "0 0 28px" }}>
              {total && currencySymbol ? (
                <Row>
                  <Column style={{ width: "50%", paddingRight: 12, verticalAlign: "top" }}>
                    <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Invoice</Text>
                    <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: "0 0 16px" }}>#{invoiceNumber}</Text>
                  </Column>
                  <Column style={{ width: "50%", paddingLeft: 12, verticalAlign: "top" }}>
                    <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Invoice Value</Text>
                    <Text style={{ color: "#0f1628", fontSize: 30, fontWeight: "bold", margin: "0 0 16px", letterSpacing: "-1px" }}>{currencySymbol}{total}</Text>
                  </Column>
                </Row>
              ) : (
                <>
                  <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Invoice</Text>
                  <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: "0 0 16px" }}>#{invoiceNumber}</Text>
                </>
              )}
              <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Viewed At</Text>
              <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: 0 }}>{viewedAt}</Text>
            </Section>

            <Button
              href={invoiceLink}
              style={{ backgroundColor: ACCENT, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
            >
              View Invoice
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

export default InvoiceViewedEmail;
