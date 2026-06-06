import {
  Html, Head, Body, Container, Section,
  Text, Button, Hr, Img, Preview,
} from "@react-email/components";
import React from "react";

type Props = {
  invoiceNumber: string;
  clientName: string;
  orgName: string;
  /** Portal link where the client reviews and signs the proposal. */
  portalLink: string;
  total?: string;
  currencySymbol?: string;
  logoUrl?: string;
  brandColor?: string;
  hidePoweredBy?: boolean;
};

/**
 * Sent to the client when a proposal has been opened but not signed after the
 * org's configured delay. The client-facing analog of the invoice "viewed but
 * unpaid" nudge — a gentle prompt to ask questions or sign.
 */
export function ProposalViewedNudgeEmail({
  invoiceNumber, clientName, orgName, portalLink, total, currencySymbol,
  logoUrl, brandColor, hidePoweredBy,
}: Props) {
  const ACCENT = brandColor ?? "#2563eb";
  return (
    <Html lang="en">
      <Head />
      <Preview>Following up on your proposal #{invoiceNumber} from {orgName}</Preview>
      <Body style={{ backgroundColor: "#f0efe9", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
        <Container style={{ maxWidth: 580, margin: "32px auto", backgroundColor: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb" }}>

          {/* Header */}
          <Section style={{ backgroundColor: "#0f1628", padding: "28px 32px", textAlign: "center" }}>
            {logoUrl ? (
              <Img src={logoUrl} alt={orgName} width={200} height={40} style={{ maxWidth: 200, maxHeight: 40, height: "auto", margin: "0 auto" }} />
            ) : (
              <Text style={{ color: "#ffffff", fontSize: 22, fontWeight: "bold", fontFamily: "Georgia, 'Times New Roman', Times, serif", margin: 0, letterSpacing: "-0.5px" }}>
                {orgName}
              </Text>
            )}
            <Text style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.15em", margin: "8px 0 0", textTransform: "uppercase" }}>
              Proposal Follow-Up
            </Text>
          </Section>

          {/* Accent strip */}
          <Section style={{ backgroundColor: ACCENT, lineHeight: "4px", fontSize: "4px" }}>&nbsp;</Section>

          {/* Body */}
          <Section style={{ padding: "32px 40px" }}>
            <Text style={{ fontSize: 16, color: "#0f1628", fontWeight: "600", margin: "0 0 8px" }}>
              Hi {clientName},
            </Text>
            <Text style={{ color: "#4b5563", fontSize: 15, lineHeight: "1.6", margin: "0 0 24px" }}>
              We noticed you had a chance to look over Proposal #{invoiceNumber}
              {total ? <> for <strong>{currencySymbol ?? ""}{total}</strong></> : null}. We&apos;d love to
              move forward whenever you&apos;re ready — you can review the details and sign online
              in just a couple of minutes. If you have any questions, simply reply to this email.
            </Text>

            <Button
              href={portalLink}
              style={{ backgroundColor: ACCENT, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
            >
              Review &amp; Sign Proposal
            </Button>
          </Section>

          {/* Footer */}
          <Hr style={{ borderColor: "#f3f4f6", margin: 0 }} />
          <Section style={{ padding: "20px 40px", textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
              Sent by {orgName}{!hidePoweredBy ? " · Powered by LWD Invoices" : ""}
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}

export default ProposalViewedNudgeEmail;
