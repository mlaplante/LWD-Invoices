import Link from "next/link";
import { GatewaySettingsForm } from "@/components/settings/GatewaySettingsForm";
import { StripeTaxToggle } from "@/components/settings/StripeTaxToggle";
import { ArrowLeft } from "lucide-react";

export default function PaymentsSettingsPage() {
  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/settings"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight truncate">
          Payment Gateways
        </h1>
      </div>

      {/* Content card */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Payment Settings
          </p>
          <p className="text-base font-semibold mt-1">Payment Gateways</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure payment gateways your clients can use to pay invoices online.
          </p>
        </div>
        <div className="px-6 py-6">
          <GatewaySettingsForm />
        </div>
      </div>

      {/* Stripe Tax — adjacent because it depends on the Stripe gateway above */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Tax Computation
          </p>
          <p className="text-base font-semibold mt-1">Stripe Tax</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Optional: replace manual tax rates with automatic, jurisdiction-aware
            tax calculation via Stripe Tax.
          </p>
        </div>
        <div className="px-6 py-6">
          <StripeTaxToggle />
        </div>
      </div>
    </div>
  );
}
