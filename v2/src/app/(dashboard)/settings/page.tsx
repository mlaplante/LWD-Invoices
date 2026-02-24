import { api } from "@/trpc/server";
import Link from "next/link";
import { OrgSettingsForm } from "@/components/settings/OrgSettingsForm";
import { CurrencyManager } from "@/components/settings/CurrencyManager";
import { TaxManager } from "@/components/settings/TaxManager";

const subPages = [
  { href: "/settings/payments", label: "Payment Gateways", description: "Configure Stripe, PayPal, and manual payment methods." },
  { href: "/settings/projects", label: "Project Settings", description: "Default project rates, expense categories, and suppliers." },
  { href: "/settings/audit-log", label: "Activity Log", description: "View a history of all actions in your organization." },
];

export default async function SettingsPage() {
  const [org, currencies, taxes] = await Promise.all([
    api.organization.get(),
    api.currencies.list(),
    api.taxes.list(),
  ]);

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-3">
        {subPages.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="rounded-lg border p-4 hover:bg-muted/30 transition-colors"
          >
            <p className="font-medium">{p.label}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{p.description}</p>
          </Link>
        ))}
      </div>

      {/* Organization */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Organization</h2>
        <OrgSettingsForm org={org} />
      </section>

      {/* Currencies */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Currencies</h2>
          <p className="text-sm text-muted-foreground">Currencies available when creating invoices.</p>
        </div>
        <CurrencyManager initialCurrencies={currencies} />
      </section>

      {/* Taxes */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Taxes</h2>
          <p className="text-sm text-muted-foreground">Tax rates that can be applied to invoice line items.</p>
        </div>
        <TaxManager initialTaxes={taxes} />
      </section>
    </div>
  );
}
