import {
  Html, Head, Body, Container, Section, Text, Img, Preview, Hr,
} from "@react-email/components";
import React from "react";

type Props = {
  /** Subject-line preview rendered by mail clients before the body. */
  preview: string;
  /** Organization display name — falls back to text logo if no logoUrl. */
  orgName: string;
  /** Optional uploaded logo URL. */
  logoUrl?: string;
  /** Hex color used for the accent strip + primary buttons. */
  brandColor?: string;
  /** Suppress "Powered by LWD Invoices" in the footer (paid plans). */
  hidePoweredBy?: boolean;
  /** Small uppercase label under the header (e.g. "NEW INVOICE"). */
  kicker?: string;
  children: React.ReactNode;
};

/**
 * Shared chrome for all transactional emails: html shell, header with logo
 * or org name, accent strip, body container, and the "Sent by … · Powered
 * by LWD Invoices" footer. Templates render only their own body content.
 */
export function EmailLayout({
  preview, orgName, logoUrl, brandColor, hidePoweredBy, kicker, children,
}: Props) {
  const accent = brandColor ?? "#2563eb";
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
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
            {kicker && (
              <Text style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.15em", margin: "8px 0 0", textTransform: "uppercase" }}>
                {kicker}
              </Text>
            )}
          </Section>

          <Section style={{ backgroundColor: accent, lineHeight: "4px", fontSize: "4px" }}>&nbsp;</Section>

          {children}

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
