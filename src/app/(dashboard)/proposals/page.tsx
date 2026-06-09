import Link from "next/link";
import { api } from "@/trpc/server";
import { ProposalList } from "@/components/proposals/ProposalList";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function ProposalsPage() {
  const rows = await api.proposals.list();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Proposals</h1>
          <p className="text-sm text-muted-foreground">Draft, send, and track client proposals.</p>
        </div>
        <Button asChild>
          <Link href="/proposals/new">
            <Plus className="mr-2 h-4 w-4" />
            New Proposal
          </Link>
        </Button>
      </div>
      <ProposalList rows={rows} />
    </div>
  );
}
