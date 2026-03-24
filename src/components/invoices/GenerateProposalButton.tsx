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
          <Button
            onClick={() =>
              createMutation.mutate({
                invoiceId,
                templateId: templateId || undefined,
              })
            }
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Proposal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
