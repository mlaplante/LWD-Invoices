import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/trpc/server";
import { ContractorForm } from "@/components/contractors/ContractorForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditContractorPage({ params }: Props) {
  const { id } = await params;

  let contractor;
  try {
    contractor = await api.contractors.getById({ id });
  } catch {
    notFound();
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href={`/contractors/${id}`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {contractor.legalName}
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight">Edit</h1>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <ContractorForm
          mode="edit"
          contractorId={id}
          defaults={{
            legalName: contractor.legalName,
            businessName: contractor.businessName ?? undefined,
            taxClassification: contractor.taxClassification ?? undefined,
            tinType: contractor.tinType ?? undefined,
            tinLast4: contractor.tinLast4,
            email: contractor.email ?? undefined,
            phone: contractor.phone ?? undefined,
            addressLine1: contractor.addressLine1 ?? undefined,
            addressLine2: contractor.addressLine2 ?? undefined,
            city: contractor.city ?? undefined,
            state: contractor.state ?? undefined,
            zip: contractor.zip ?? undefined,
            country: contractor.country ?? undefined,
            w9Status: contractor.w9Status,
            exemptFrom1099: contractor.exemptFrom1099,
            notes: contractor.notes ?? undefined,
          }}
        />
      </div>
    </div>
  );
}
