import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ContractorForm } from "@/components/contractors/ContractorForm";

export default function NewContractorPage() {
  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/contractors"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Contractors
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight">New Contractor</h1>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <ContractorForm mode="create" />
      </div>
    </div>
  );
}
