import { Section, Text, Row, Column, Button, Hr } from "@react-email/components";
import React from "react";
import { EmailLayout } from "./EmailLayout";
import type {
  BriefingAtRiskClient,
  BriefingCollectionItem,
  BriefingForecastHorizon,
  BriefingOverdueClient,
} from "@/server/services/weekly-briefing";

type Props = {
  orgName: string;
  logoUrl?: string;
  brandColor?: string;
  hidePoweredBy?: boolean;
  appUrl: string;
  currencySymbol: string;
  headline: string;
  overdue: { total: number; count: number; topClients: BriefingOverdueClient[] };
  atRiskClients: BriefingAtRiskClient[];
  forecast: BriefingForecastHorizon[];
  collections: BriefingCollectionItem[];
  /** Human-readable week-ending date for the header. */
  periodLabel: string;
};

const labelStyle = {
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "#64748b",
  margin: "0 0 6px",
  fontWeight: 700,
};

function money(symbol: string, n: number): string {
  return `${symbol}${Math.round(n).toLocaleString("en-US")}`;
}

const BAND_COLORS: Record<string, string> = {
  at_risk: "#b45309",
  critical: "#b91c1c",
  stable: "#475569",
  healthy: "#047857",
};

/**
 * Monday "business briefing" email. Leads with the headline numbers (overdue
 * total + projected cash), then at-risk clients and the recommended collection
 * actions, each deep-linking back into the app. Renders entirely from the
 * WeeklyBriefingData payload so the cron and the live preview stay identical.
 */
export function WeeklyBriefingEmail({
  orgName,
  logoUrl,
  brandColor,
  hidePoweredBy,
  appUrl,
  currencySymbol,
  headline,
  overdue,
  atRiskClients,
  forecast,
  collections,
  periodLabel,
}: Props) {
  const accent = brandColor ?? "#2563eb";
  const h30 = forecast.find((h) => h.horizonDays === 30);

  return (
    <EmailLayout
      preview={headline}
      orgName={orgName}
      logoUrl={logoUrl}
      brandColor={brandColor}
      hidePoweredBy={hidePoweredBy}
      kicker="Weekly Business Briefing"
    >
      <Section style={{ padding: "28px 32px 8px" }}>
        <Text style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 4px" }}>{periodLabel}</Text>
        <Text style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: 0, lineHeight: "1.4" }}>
          {headline}
        </Text>
      </Section>

      {/* Top metric cards: overdue + projected 30-day inflow */}
      <Section style={{ padding: "16px 32px 0" }}>
        <Row>
          <Column style={{ width: "50%", paddingRight: 8 }}>
            <Section style={{ backgroundColor: "#fef2f2", borderRadius: 10, padding: "16px 18px" }}>
              <Text style={labelStyle}>Overdue</Text>
              <Text style={{ fontSize: 24, fontWeight: 800, color: "#b91c1c", margin: 0 }}>
                {money(currencySymbol, overdue.total)}
              </Text>
              <Text style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                {overdue.count} invoice{overdue.count === 1 ? "" : "s"} past due
              </Text>
            </Section>
          </Column>
          <Column style={{ width: "50%", paddingLeft: 8 }}>
            <Section style={{ backgroundColor: "#f0fdf4", borderRadius: 10, padding: "16px 18px" }}>
              <Text style={labelStyle}>Projected (30d)</Text>
              <Text style={{ fontSize: 24, fontWeight: 800, color: "#047857", margin: 0 }}>
                {h30 ? money(currencySymbol, h30.projectedInflow) : "—"}
              </Text>
              <Text style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                {h30 ? `${Math.round(h30.confidence * 100)}% confidence` : "no forecast yet"}
              </Text>
            </Section>
          </Column>
        </Row>
      </Section>

      {/* Cash-flow horizons */}
      {forecast.length > 0 && (
        <Section style={{ padding: "20px 32px 0" }}>
          <Text style={labelStyle}>Projected cash position</Text>
          <Row>
            {forecast.map((h) => (
              <Column key={h.horizonDays} style={{ width: `${100 / forecast.length}%` }}>
                <Text style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 2px" }}>
                  {h.horizonDays} days
                </Text>
                <Text style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>
                  {money(currencySymbol, h.projectedPosition)}
                </Text>
              </Column>
            ))}
          </Row>
        </Section>
      )}

      {/* At-risk clients */}
      {atRiskClients.length > 0 && (
        <Section style={{ padding: "24px 32px 0" }}>
          <Text style={labelStyle}>Clients at risk</Text>
          {atRiskClients.map((c) => (
            <Row key={c.clientId} style={{ marginBottom: 10 }}>
              <Column>
                <Text style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", margin: 0 }}>
                  {c.clientName}{" "}
                  <span style={{ fontSize: 12, fontWeight: 700, color: BAND_COLORS[c.band] ?? "#64748b" }}>
                    · {c.score}/100
                  </span>
                </Text>
                <Text style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0" }}>
                  {c.headline} ({c.churnRiskPercent}% churn risk)
                </Text>
              </Column>
            </Row>
          ))}
        </Section>
      )}

      {/* Recommended collection actions */}
      {collections.length > 0 && (
        <Section style={{ padding: "24px 32px 0" }}>
          <Text style={labelStyle}>Recommended actions</Text>
          {collections.map((c) => (
            <Row key={c.invoiceId} style={{ marginBottom: 8 }}>
              <Column>
                <Text style={{ fontSize: 13, color: "#0f172a", margin: 0 }}>
                  <strong>{c.recommendedAction}</strong> — #{c.invoiceNumber} · {c.clientName}
                </Text>
                <Text style={{ fontSize: 12, color: "#64748b", margin: "1px 0 0" }}>
                  {money(currencySymbol, c.balance)} · {c.daysOverdue} day{c.daysOverdue === 1 ? "" : "s"} overdue
                </Text>
              </Column>
            </Row>
          ))}
        </Section>
      )}

      <Section style={{ padding: "28px 32px 8px", textAlign: "center" }}>
        <Button
          href={`${appUrl}/reports/client-health`}
          style={{
            backgroundColor: accent,
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 600,
            padding: "12px 28px",
            borderRadius: 8,
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Open the dashboard
        </Button>
      </Section>

      <Hr style={{ borderColor: "#f3f4f6", margin: "20px 0 0" }} />
      <Section style={{ padding: "12px 32px 0" }}>
        <Text style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>
          You&apos;re receiving this because the weekly briefing is enabled for {orgName}. Manage it
          in Settings → Weekly Briefing.
        </Text>
      </Section>
    </EmailLayout>
  );
}

export default WeeklyBriefingEmail;
