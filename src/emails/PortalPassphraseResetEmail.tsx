import {
  Html,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Img,
} from "@react-email/components";
import * as React from "react";

const ACCENT = "#2563eb";

type Props = {
  resetUrl: string;
  orgName: string;
  clientName?: string | null;
  logoUrl?: string | null;
};

export default function PortalPassphraseResetEmail({
  resetUrl,
  orgName,
  clientName,
  logoUrl,
}: Props) {
  return (
    <Html>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif", backgroundColor: "#f9fafb", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px" }}>
          <Section style={{ backgroundColor: "#fff", borderRadius: 12, padding: 32, border: "1px solid #e5e7eb" }}>
            {logoUrl && (
              <Img src={logoUrl} alt={orgName} height={40} style={{ marginBottom: 24 }} />
            )}
            <Text style={{ fontSize: 20, fontWeight: 700, color: "#111", marginBottom: 8 }}>
              Reset your portal passphrase
            </Text>
            <Text style={{ fontSize: 14, color: "#555", lineHeight: "1.6" }}>
              {clientName ? `Hi ${clientName}, a` : "A"} passphrase reset was requested for your client
              portal at <strong>{orgName}</strong>. Click the button below to choose a new passphrase.
            </Text>
            <Button
              href={resetUrl}
              style={{
                display: "inline-block",
                backgroundColor: ACCENT,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                padding: "12px 24px",
                borderRadius: 8,
                textDecoration: "none",
                marginTop: 16,
                marginBottom: 16,
              }}
            >
              Choose a New Passphrase
            </Button>
            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />
            <Text style={{ fontSize: 12, color: "#999" }}>
              This link expires in 1 hour and can be used once. If you didn&apos;t request this,
              you can safely ignore it — your current passphrase still works.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
