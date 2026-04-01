import { api } from "@/trpc/server";
import Link from "next/link";
import { OrgSettingsForm } from "@/components/settings/OrgSettingsForm";
import { BrandingForm } from "@/components/settings/BrandingForm";
import { CurrencyManager } from "@/components/settings/CurrencyManager";
import { TaxManager } from "@/components/settings/TaxManager";
import { CreditCard, FileText, FolderKanban, ScrollText, Wallet, Mail, ChevronRight } from "lucide-react";

// ── Sub-page nav cards ─────────────────────────────────────────────────────────

const subPages = [
  {
    href: "/settings/payments",
    label: "Payment Gateways",
    description: "Configure Stripe, PayPal, and manual payment methods.",
    icon: <CreditCard className="w-4 h-4" />,
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    href: "/settings/projects",
    label: "Project Settings",
    description: "Default task statuses, project templates, and rates.",
    icon: <FolderKanban className="w-4 h-4" />,
    color: "bg-violet-50 text-violet-600",
  },
  {
    href: "/settings/audit-log",
    label: "Activity Log",
    description: "View a history of all actions in your organization.",
    icon: <ScrollText className="w-4 h-4" />,
    color: "bg-blue-50 text-blue-600",
  },
  {
    href: "/settings/expenses",
    label: "Expense Settings",
    description: "Manage expense categories and suppliers.",
    icon: <Wallet className="w-4 h-4" />,
    color: "bg-amber-50 text-amber-600",
  },
  {
    href: "/settings/proposals",
    label: "Proposal Templates",
    description: "Manage reusable proposal templates for estimates.",
    icon: <FileText className="w-4 h-4" />,
    color: "bg-rose-50 text-rose-600",
  },
  {
    href: "/settings/automations",
    label: "Email Automations",
    description: "Automated emails triggered by invoice events.",
    icon: <Mail className="w-4 h-4" />,
    color: "bg-indigo-50 text-indigo-600",
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SettingsPage() {
  const [org, currencies, taxes] = await Promise.all([
    api.organization.get(),
    api.currencies.list(),
    api.taxes.list(),
  ]);

  return (
    <div className="space-y-5">
      {/* Page heading */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </div>

      {/* Quick nav links */}
      <div className="grid gap-3 sm:grid-cols-3">
        {subPages.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="group rounded-2xl border border-border/50 bg-card p-4 hover:border-primary/30 hover:bg-accent/30 transition-colors flex items-start gap-3"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${p.color}`}>
              {p.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                {p.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {p.description}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
          </Link>
        ))}
      </div>

      {/* Organization */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Organization
          </p>
          <p className="text-base font-semibold mt-1">General Settings</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your organization name, invoice numbering, and time tracking preferences.
          </p>
        </div>
        <div className="px-6 py-6">
          <OrgSettingsForm org={org} />
        </div>
      </div>

      {/* Branding */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Branding
          </p>
          <p className="text-base font-semibold mt-1">Brand &amp; Appearance</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Customize your brand color and logo on invoices and the client portal.
          </p>
        </div>
        <div className="px-6 py-6">
          <BrandingForm org={org} />
        </div>
      </div>

      {/* Currencies */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Currencies
          </p>
          <p className="text-base font-semibold mt-1">Currency Management</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Currencies available when creating invoices and projects.
          </p>
        </div>
        <div className="px-6 py-6">
          <CurrencyManager initialCurrencies={currencies} />
        </div>
      </div>

      {/* Taxes */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Taxes
          </p>
          <p className="text-base font-semibold mt-1">Tax Rates</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tax rates that can be applied to invoice line items.
          </p>
        </div>
        <div className="px-6 py-6">
          <TaxManager initialTaxes={taxes} />
        </div>
      </div>
    </div>
  );
}
