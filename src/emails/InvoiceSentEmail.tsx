import {
  Section, Row, Column, Text, Button,
} from "@react-email/components";
import React from "react";
import { EmailLayout } from "./EmailLayout";

type PartialPaymentInfo = {
  amount: string;
  dueDate: string | null;
  isPaid: boolean;
};

type Props = {
  invoiceNumber: string;
  clientName: string;
  total: string;
  currencySymbol: string;
  dueDate: string | null;
  orgName: string;
  portalLink: string;
  payLink?: string;
  logoUrl?: string;
  brandColor?: string;
  hidePoweredBy?: boolean;
  partialPayments?: PartialPaymentInfo[];
  /** Live early-payment offer, pre-formatted by the caller. */
  earlyPayOffer?: { percent: number; deadline: string; discountedTotal: string };
};

export function InvoiceSentEmail({
  invoiceNumber, clientName, total, currencySymbol, dueDate, orgName, portalLink, payLink, logoUrl, brandColor, hidePoweredBy, partialPayments, earlyPayOffer,
}: Props) {
  const accent = brandColor ?? "#2563eb";
  return (
    <EmailLayout
      preview={`Invoice #${invoiceNumber} from ${orgName} — ${currencySymbol}${total}`}
      orgName={orgName}
      logoUrl={logoUrl}
      brandColor={brandColor}
      hidePoweredBy={hidePoweredBy}
      kicker="New Invoice"
    >
      <Section style={{ padding: "32px 40px" }}>
        <Text style={{ fontSize: 16, color: "#0f1628", fontWeight: "600", margin: "0 0 8px" }}>
          Hi {clientName},
        </Text>
        <Text style={{ color: "#4b5563", fontSize: 15, lineHeight: "1.6", margin: "0 0 24px" }}>
          You have a new invoice from <strong>{orgName}</strong>. Please review and pay at your earliest convenience.
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
          {dueDate && (
            <>
              <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px", fontWeight: "500" }}>Due Date</Text>
              <Text style={{ color: "#0f1628", fontSize: 15, fontWeight: "bold", margin: 0 }}>{dueDate}</Text>
            </>
          )}
        </Section>

        {earlyPayOffer && (
          <Section style={{ backgroundColor: "#ecfdf5", borderRadius: 8, padding: "14px 20px", margin: "0 0 28px", borderLeft: "3px solid #10b981" }}>
            <Text style={{ color: "#065f46", fontSize: 14, fontWeight: "600", margin: 0 }}>
              Pay online by {earlyPayOffer.deadline} and save {earlyPayOffer.percent}% — {currencySymbol}{earlyPayOffer.discountedTotal} instead of {currencySymbol}{total}.
            </Text>
          </Section>
        )}

        {partialPayments && partialPayments.length > 0 && (
          <Section style={{ margin: "0 0 28px" }}>
            <Text style={{ color: "#9ca3af", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px", fontWeight: "500" }}>Payment Schedule</Text>
            {partialPayments.map((payment, index) => (
              <Section key={index} style={{ backgroundColor: payment.isPaid ? "#f0fdf4" : "#f8f8f7", borderRadius: 6, padding: "12px 16px", margin: "0 0 8px", borderLeft: payment.isPaid ? "3px solid #22c55e" : "none" }}>
                <Row>
                  <Column style={{ width: "60%", verticalAlign: "middle" }}>
                    <Text style={{ color: "#0f1628", fontSize: 14, fontWeight: "600", margin: "0 0 2px" }}>
                      Payment {index + 1} {payment.isPaid ? "✓" : ""}
                    </Text>
                    {payment.dueDate && (
                      <Text style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>
                        Due: {payment.dueDate}
                      </Text>
                    )}
                  </Column>
                  <Column style={{ width: "40%", textAlign: "right", verticalAlign: "middle" }}>
                    <Text style={{ color: payment.isPaid ? "#22c55e" : "#0f1628", fontSize: 16, fontWeight: "bold", margin: 0 }}>
                      {currencySymbol}{payment.amount}
                    </Text>
                  </Column>
                </Row>
              </Section>
            ))}
          </Section>
        )}

        {payLink ? (
          <>
            <Button
              href={payLink}
              style={{ backgroundColor: accent, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
            >
              Pay {currencySymbol}{Number(total).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Now
            </Button>
            <Text style={{ fontSize: 13, color: "#6b7280", margin: "12px 0 0", textAlign: "center" }}>
              <a href={portalLink} style={{ color: "#6b7280", textDecoration: "underline" }}>
                View full invoice
              </a>
            </Text>
          </>
        ) : (
          <Button
            href={portalLink}
            style={{ backgroundColor: accent, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
          >
            View Invoice
          </Button>
        )}
      </Section>
    </EmailLayout>
  );
}

export default InvoiceSentEmail;
