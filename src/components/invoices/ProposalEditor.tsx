"use client";

import { useState, useEffect, useTransition } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Trash2 } from "lucide-react";
import { ProposalSectionsEditor, type ProposalSection } from "@/components/proposals/ProposalSectionsEditor";

export function ProposalEditor({ invoiceId }: { invoiceId: string }) {
  const { data: proposal, isLoading } = trpc.proposals.get.useQuery({ invoiceId });
  const [sections, setSections] = useState<ProposalSection[]>([]);
  const [isPending, startTransition] = useTransition();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (proposal) {
      setSections(proposal.sections as ProposalSection[]);
    }
  }, [proposal]);

  const updateMutation = trpc.proposals.update.useMutation({
    onSuccess: () => toast.success("Proposal saved"),
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.proposals.delete.useMutation({
    onSuccess: () => {
      toast.success("Proposal removed");
      utils.proposals.get.invalidate({ invoiceId });
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return null;
  if (!proposal) return null;

  function handleSave() {
    startTransition(() => {
      updateMutation.mutate({ invoiceId, sections });
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Proposal</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/api/invoices/${invoiceId}/proposal-pdf`}
              target="_blank"
              rel="noreferrer"
            >
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </a>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm("Remove this proposal?")) {
                deleteMutation.mutate({ invoiceId });
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ProposalSectionsEditor sections={sections} onChange={setSections} />

      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? "Saving..." : "Save Proposal"}
      </Button>
    </div>
  );
}
