import { api } from "@/trpc/server";
import Link from "next/link";
import { OrgSettingsForm } from "@/components/settings/OrgSettingsForm";
import { Require2FAToggle } from "@/components/settings/Require2FAToggle";
import { BrandingForm } from "@/components/settings/BrandingForm";
import { PortalBrandingForm } from "@/components/settings/PortalBrandingForm";
import { CurrencyManager } from "@/components/settings/CurrencyManager";
import { TaxManager } from "@/components/settings/TaxManager";
import { CreditCard, FileText, FolderKanban, ScrollText, Wallet, Mail, ShieldAlert, Palette, ChevronRight, CalendarClock, Bell, Shield, User, HeartHandshake, Newspaper, Workflow, Landmark } from "lucide-react";

// ── Sub-page nav cards ─────────────────────────────────────────────────────────

const subPages = [
  {
    href: "/settings/account",
    label: "Account",
    description: "Update your name and profile information.",
    icon: <User className="w-4 h-4" />,
    color: "bg-muted text-muted-foreground",
  },
  {
    href: "/settings/security",
    label: "Security",
    description: "Two-factor authentication and account security settings.",
    icon: <Shield className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/settings/invoices",
    label: "Invoice Templates",
    description: "Choose your PDF layout and customize fonts, colors, and footer.",
    icon: <Palette className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/settings/payments",
    label: "Payment Gateways",
    description: "Configure Stripe, PayPal, and manual payment methods.",
    icon: <CreditCard className="w-4 h-4" />,
    color: "bg-success/10 text-success-foreground",
  },
  {
    href: "/settings/projects",
    label: "Project Settings",
    description: "Default task statuses, project templates, and rates.",
    icon: <FolderKanban className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/settings/audit-log",
    label: "Activity Log",
    description: "View a history of all actions in your organization.",
    icon: <ScrollText className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/settings/expenses",
    label: "Expense Settings",
    description: "Manage expense categories and suppliers.",
    icon: <Wallet className="w-4 h-4" />,
    color: "bg-warning/12 text-warning-foreground",
  },
  {
    href: "/settings/proposals",
    label: "Proposal Templates",
    description: "Manage reusable proposal templates for estimates.",
    icon: <FileText className="w-4 h-4" />,
    color: "bg-danger/10 text-danger-foreground",
  },
  {
    href: "/settings/automations",
    label: "Email Automations",
    description: "Automated emails triggered by invoice events.",
    icon: <Mail className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/settings/automation-rules",
    label: "Automation Rules",
    description: "No-code trigger → conditions → actions rules over your invoices.",
    icon: <Workflow className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/settings/policies",
    label: "Policies",
    description: "Late fees, interest, and payment enforcement rules.",
    icon: <ShieldAlert className="w-4 h-4" />,
    color: "bg-warning/12 text-warning-foreground",
  },
  {
    href: "/settings/reports",
    label: "Scheduled Reports",
    description: "Automatically generate and email reports on a recurring schedule.",
    icon: <CalendarClock className="w-4 h-4" />,
    color: "bg-success/10 text-success-foreground",
  },
  {
    href: "/settings/reminders",
    label: "Reminder Sequences",
    description: "Automatic escalating reminder emails for unpaid invoices.",
    icon: <Bell className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/settings/retention",
    label: "Client Retention",
    description: "Weekly check-in queue and message templates for past clients.",
    icon: <HeartHandshake className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/settings/briefing",
    label: "Weekly Briefing",
    description: "Proactive Monday email: overdue total, at-risk clients, projected cash.",
    icon: <Newspaper className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/settings/estimated-tax",
    label: "Estimated Taxes",
    description: "Quarterly self-employment set-aside percentage and due-date reminders.",
    icon: <Landmark className="w-4 h-4" />,
    color: "bg-warning/12 text-warning-foreground",
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
            className="group rounded-[10px] border border-border bg-card p-4 hover:border-primary/30 hover:bg-accent/30 transition-colors flex items-start gap-3"
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
      <div className="rounded-[10px] border border-border bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <p className="eyebrow lowercase text-[11px]">
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

      {/* Security Enforcement */}
      <div className="rounded-[10px] border border-border bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <p className="eyebrow lowercase text-[11px]">
            Security
          </p>
          <p className="text-base font-semibold mt-1">Team Security</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enforce security requirements for all team members.
          </p>
        </div>
        <div className="px-6 py-6">
          <Require2FAToggle require2FA={org.require2FA} />
        </div>
      </div>

      {/* Branding */}
      <div className="rounded-[10px] border border-border bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <p className="eyebrow lowercase text-[11px]">
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

      {/* Portal Branding */}
      <div className="rounded-[10px] border border-border bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <p className="eyebrow lowercase text-[11px]">
            Portal
          </p>
          <p className="text-base font-semibold mt-1">Portal Branding</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Customize how your client portal looks — tagline, fonts, footer, and powered-by badge.
          </p>
        </div>
        <div className="px-6 py-6">
          <PortalBrandingForm org={org} />
        </div>
      </div>

      {/* Currencies */}
      <div className="rounded-[10px] border border-border bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <p className="eyebrow lowercase text-[11px]">
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
      <div className="rounded-[10px] border border-border bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <p className="eyebrow lowercase text-[11px]">
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
