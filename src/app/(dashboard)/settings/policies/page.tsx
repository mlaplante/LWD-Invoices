import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LateFeeSettingsForm } from "@/components/settings/LateFeeSettingsForm";

export default async function PoliciesSettingsPage() {
  const org = await api.organization.get();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-2xl font-bold tracking-tight">Policies</h1>
      </div>

      {/* Late Fees */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Late Fees
          </p>
          <p className="text-base font-semibold mt-1">Late Fee Settings</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automatically apply late fees to overdue invoices based on your policy.
          </p>
        </div>
        <div className="px-6 py-6">
          <LateFeeSettingsForm org={org} />
        </div>
      </div>
    </div>
  );
}
