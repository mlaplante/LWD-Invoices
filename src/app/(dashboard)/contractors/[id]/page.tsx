import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api, HydrateClient } from "@/trpc/server";
import { ContractorDetail } from "@/components/contractors/ContractorDetail";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ContractorPage({ params }: Props) {
  const { id } = await params;
  void api.contractors.getById.prefetch({ id });

  return (
    <div className="space-y-5">
      <Link
        href="/contractors"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Contractors
      </Link>
      <HydrateClient>
        <ContractorDetail contractorId={id} />
      </HydrateClient>
    </div>
  );
}
