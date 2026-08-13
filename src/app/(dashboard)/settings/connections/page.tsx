import Link from "next/link";

import { api } from "@/trpc/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Connections · LWD Invoices" };

type ConnectionState = "connected" | "available" | "unconfigured";

type Connection = {
  name: string;
  purpose: string;
  /** Mono health line — webhook state, verified domain, key fingerprint. */
  health: string;
  state: ConnectionState;
  href: string;
};

const STATE_BADGE: Record<
  ConnectionState,
  { label: string; variant: "success" | "default" | "secondary" }
> = {
  connected: { label: "connected", variant: "success" },
  available: { label: "configured", variant: "default" },
  unconfigured: { label: "not connected", variant: "secondary" },
};

/**
 * One grid for everything the app talks to — payment gateways, email, the
 * job runner and the REST API. Previously these were scattered across
 * separate settings sub-pages, which made "is anything broken?" a
 * multi-page question.
 *
 * Server-side env presence is reported as a boolean only; no key material
 * or hostnames reach the client.
 */
export default async function ConnectionsPage() {
  const gateways = await api.gatewaySettings.list();
  const byType = new Map(gateways.map((g) => [g.gatewayType, g]));

  const stripe = byType.get("STRIPE");
  const paypal = byType.get("PAYPAL");
  // Offline methods share one card — they're one decision to the user.
  const offline = (["BANK_TRANSFER", "CASH", "CHECK", "MONEY_ORDER"] as const)
    .map((type) => byType.get(type))
    .filter((g) => g !== undefined);
  const offlineEnabled = offline.filter((g) => g.isEnabled);

  const resendConfigured = Boolean(process.env.RESEND_API_KEY);
  const inngestConfigured = Boolean(
    process.env.INNGEST_EVENT_KEY || process.env.INNGEST_SIGNING_KEY,
  );

  const connections: Connection[] = [
    {
      name: "Stripe",
      purpose:
        "Cards, ACH debit, saved cards, disputes and refunds via webhooks.",
      health: stripe
        ? `${stripe.isEnabled ? "enabled" : "disabled"} · ach ${
            (stripe.safeConfig as { achDebitEnabled?: boolean })
              .achDebitEnabled
              ? "on"
              : "off"
          }`
        : "no keys stored",
      state: stripe?.isEnabled
        ? "connected"
        : stripe
          ? "available"
          : "unconfigured",
      href: "/settings/payments",
    },
    {
      name: "PayPal",
      purpose: "Portal payments via PayPal checkout.",
      health: paypal
        ? `${paypal.isEnabled ? "enabled" : "disabled"} · ${
            (paypal.safeConfig as { email?: string }).email ??
            "no account email"
          }`
        : "no account linked",
      state: paypal?.isEnabled
        ? "connected"
        : paypal
          ? "available"
          : "unconfigured",
      href: "/settings/payments",
    },
    {
      name: "Offline payment",
      purpose:
        "Bank transfer, cheque, cash and money order instructions shown on the invoice.",
      health: offlineEnabled.length
        ? `${offlineEnabled.length} method${offlineEnabled.length === 1 ? "" : "s"} offered`
        : "not offered",
      state: offlineEnabled.length ? "connected" : "unconfigured",
      href: "/settings/payments",
    },
    {
      name: "Resend",
      purpose:
        "Invoice email delivery plus open/click tracking, which powers the engagement panels.",
      health: resendConfigured
        ? "api key present · delivery active"
        : "no api key configured",
      state: resendConfigured ? "connected" : "unconfigured",
      href: "/settings/reminders",
    },
    {
      name: "Inngest",
      purpose:
        "Background jobs: recurring invoices, reminders, briefings, budget alerts.",
      health: inngestConfigured
        ? "signing key present · jobs scheduled"
        : "running in dev mode",
      state: inngestConfigured ? "connected" : "unconfigured",
      href: "/settings/automations",
    },
    {
      name: "Automations",
      purpose: "Rule-based follow-ups and status changes across the workspace.",
      health: "managed in automation rules",
      state: "available",
      href: "/settings/automation-rules",
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[28px]">Connections</h1>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          credentials encrypted at rest · per-organization
        </p>
      </div>

      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {connections.map((connection) => {
          const badge = STATE_BADGE[connection.state];
          return (
            <Card key={connection.name} className="gap-0 px-6">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{connection.name}</span>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                {connection.purpose}
              </p>
              <p className="mt-2.5 font-mono text-[10px] text-muted-foreground">
                {connection.health}
              </p>
              <div className="mt-3">
                <Button asChild size="xs" variant="outline">
                  <Link href={connection.href}>
                    {connection.state === "unconfigured" ? "Connect" : "Manage"}
                  </Link>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
