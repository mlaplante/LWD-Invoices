import { Section, Text, Button } from "@react-email/components";
import React from "react";
import { EmailLayout } from "./EmailLayout";

type Props = {
  orgName: string;
  /** e.g. "Q2 2026" */
  periodLabel: string;
  /** Pre-formatted due date, e.g. "June 15, 2026". */
  dueDateLabel: string;
  daysUntil: number;
  /** Pre-formatted money strings (caller applies the currency symbol). */
  amountDue: string;
  /** Pre-formatted amount already paid this quarter, when any. */
  alreadyPaid?: string;
  netIncome: string;
  /** Link to the Estimated Taxes report. */
  reportLink: string;
  logoUrl?: string;
  brandColor?: string;
  hidePoweredBy?: boolean;
};

/**
 * Heads-up email sent a configurable number of days before a federal quarterly
 * estimated-tax deadline, with the recommended set-aside for the quarter.
 */
export function EstimatedTaxReminderEmail({
  orgName,
  periodLabel,
  dueDateLabel,
  daysUntil,
  amountDue,
  alreadyPaid,
  netIncome,
  reportLink,
  logoUrl,
  brandColor,
  hidePoweredBy,
}: Props) {
  const accent = brandColor ?? "#ea580c";
  return (
    <EmailLayout
      preview={`Estimated tax for ${periodLabel} is due ${dueDateLabel}`}
      orgName={orgName}
      logoUrl={logoUrl}
      brandColor={accent}
      hidePoweredBy={hidePoweredBy}
      kicker="Estimated Tax Reminder"
    >
      <Section style={{ padding: "32px 40px" }}>
        <Text style={{ fontSize: 16, color: "#0f1628", fontWeight: "600", margin: "0 0 8px" }}>
          Your {periodLabel} estimated tax payment is coming up
        </Text>
        <Text style={{ color: "#4b5563", fontSize: 15, lineHeight: "1.6", margin: "0 0 20px" }}>
          The federal deadline is <strong>{dueDateLabel}</strong> — {daysUntil} day
          {daysUntil === 1 ? "" : "s"} away. Based on your net self-employment income
          this quarter ({netIncome})
          {alreadyPaid ? <> and the {alreadyPaid} you&apos;ve already paid</> : null}, here&apos;s
          what we suggest paying:
        </Text>

        <Section
          style={{
            backgroundColor: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: 10,
            padding: "20px 24px",
            margin: "0 0 24px",
            textAlign: "center",
          }}
        >
          <Text style={{ fontSize: 12, color: "#9a3412", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>
            Remaining for {periodLabel}
          </Text>
          <Text style={{ fontSize: 30, fontWeight: "bold", color: "#9a3412", margin: 0 }}>
            {amountDue}
          </Text>
        </Section>

        <Button
          href={reportLink}
          style={{ backgroundColor: accent, color: "#ffffff", padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 15, display: "inline-block" }}
        >
          View the breakdown
        </Button>

        <Text style={{ color: "#9ca3af", fontSize: 12, lineHeight: "1.6", margin: "24px 0 0" }}>
          This is a planning estimate, not tax advice. Confirm your actual payment
          amount and deadline with your accountant or the IRS.
        </Text>
      </Section>
    </EmailLayout>
  );
}

export default EstimatedTaxReminderEmail;
