"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileText } from "lucide-react";

export function GenerateProposalButton({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");

  const { data: templates } = trpc.proposalTemplates.list.useQuery();
  const { data: existingProposal } = trpc.proposals.get.useQuery({ invoiceId });
  const utils = trpc.useUtils();

  const createMutation = trpc.proposals.create.useMutation({
    onSuccess: () => {
      toast.success("Proposal created");
      setOpen(false);
      utils.proposals.get.invalidate({ invoiceId });
    },
    onError: (err) => toast.error(err.message),
  });

  const generate = trpc.proposals.generate.useMutation({
    onSuccess: (res) => {
      if (!res.draft) {
        toast.error("AI draft unavailable — create from the template instead.");
        return;
      }
      // TODO(plan-4-followup): surface suggestedItems
      createMutation.mutate({
        invoiceId,
        templateId: templateId || undefined,
        sections: res.draft.sections,
      });
    },
    onError: (err) => toast.error(err.message),
  });

  if (existingProposal) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="mr-2 h-4 w-4" />
          Generate Proposal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Proposal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Template</label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {t.isDefault ? "(Default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                createMutation.mutate({
                  invoiceId,
                  templateId: templateId || undefined,
                })
              }
              disabled={createMutation.isPending || generate.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Proposal"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={generate.isPending || createMutation.isPending}
              onClick={() =>
                generate.mutate({ invoiceId, templateId: templateId || undefined })
              }
            >
              {generate.isPending ? "Drafting…" : "Draft with AI"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
