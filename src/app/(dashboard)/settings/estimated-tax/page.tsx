import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EstimatedTaxSettings } from "@/components/settings/EstimatedTaxSettings";

export default function EstimatedTaxSettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Estimated Taxes</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Recommend a quarterly self-employment tax set-aside from your net income,
          and (optionally) email yourself a reminder before each federal due date.
          See the full breakdown on the{" "}
          <Link href="/reports/estimated-tax" className="underline hover:text-foreground">
            Estimated Taxes report
          </Link>
          .
        </p>
      </div>
      <EstimatedTaxSettings />
    </div>
  );
}
