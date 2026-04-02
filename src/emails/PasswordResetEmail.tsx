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
  logoUrl?: string | null;
};

export default function PasswordResetEmail({
  resetUrl,
  orgName,
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
              Reset your password
            </Text>
            <Text style={{ fontSize: 14, color: "#555", lineHeight: "1.6" }}>
              Your administrator at <strong>{orgName}</strong> has requested a password reset for your account.
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
              Reset Password
            </Button>
            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />
            <Text style={{ fontSize: 12, color: "#999" }}>
              This link expires in 24 hours. If you didn&apos;t expect this email, you can safely ignore it.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
