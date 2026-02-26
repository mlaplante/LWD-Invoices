import {
  Html, Head, Body, Container, Section, Row, Column,
  Text, Button, Hr, Img, Preview,
} from "@react-email/components";
import React from "react";

type Props = {
  invoiceNumber: string;
  clientName: string;
  total: string;
  currencySymbol: string;
  dueDate: string;
  daysUntilDue: number;
  orgName: string;
  portalLink: string;
  logoUrl?: string;
};

const ACCENT = "#d97706";

export function PaymentReminderEmail({
  invoiceNumber, clientName, total, currencySymbol, dueDate, daysUntilDue, orgName, portalLink, logoUrl,
}: Props) {
  const dayLabel = daysUntilDue === 1 ? "day" : "days";
  return (
    <Html>
      <Head />
      <Preview>{`Payment reminder — Invoice #${invoiceNumber} due in ${daysUntilDue} ${dayLabel}`}</Preview>
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
              Payment Reminder
            </Text>
          </Section>

          <Section style={{ backgroundColor: ACCENT, lineHeight: "4px", fontSize: "4px" }}>&nbsp;</Section>

          <Section style={{ padding: "32px 40px" }}>
            <Text style={{ fontSize: 16, color: "#0f1628", fontWeight: "600", margin: "0 0 8px" }}>
              Hi {clientName},
            </Text>
            <Text style={{ color: "#4b5563", fontSize: 15, lineHeight: "1.6", margin: "0 0 24px" }}>
              This is a friendly reminder that invoice <strong>#{invoiceNumber}</strong> is due in <strong>{daysUntilDue} {dayLabel}</strong>.
            </Text>

            <Section style={{ backgroundColor: "#f8f8f7", borderRadius: 8, padding: "20px 24px", margin: "0 0 28px" }}>
              <Row>
                <Column style={{ width: "50%", paddingRight: 12, verticalAlign: "top" }}>
                  <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Invoice</Text>
                  <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: "0 0 16px" }}>#{invoiceNumber}</Text>
                </Column>
                <Column style={{ width: "50%", paddingLeft: 12, verticalAlign: "top" }}>
                  <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Amount Due</Text>
                  <Text style={{ color: "#0f1628", fontSize: 30, fontWeight: "bold", margin: "0 0 16px", letterSpacing: "-1px" }}>{currencySymbol}{total}</Text>
                </Column>
              </Row>
              <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Due Date</Text>
              <Row>
                <Column style={{ verticalAlign: "middle" }}>
                  <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: 0 }}>{dueDate}</Text>
                </Column>
                <Column style={{ textAlign: "right", verticalAlign: "middle" }}>
                  <Text style={{ color: "#ffffff", backgroundColor: ACCENT, fontSize: 12, fontWeight: "bold", padding: "3px 10px", borderRadius: 20, margin: 0, display: "inline-block" }}>
                    Due in {daysUntilDue} {dayLabel}
                  </Text>
                </Column>
              </Row>
            </Section>

            <Button
              href={portalLink}
              style={{ backgroundColor: ACCENT, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
            >
              Pay Invoice
            </Button>
          </Section>

          <Hr style={{ borderColor: "#f3f4f6", margin: 0 }} />
          <Section style={{ padding: "20px 40px", textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
              Sent by {orgName} · Powered by Pancake
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}

export default PaymentReminderEmail;
