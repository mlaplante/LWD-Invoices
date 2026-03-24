"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ProposalTemplateForm } from "./ProposalTemplateForm";
import { Plus, Pencil, Trash2 } from "lucide-react";

type Template = {
  id: string;
  name: string;
  isDefault: boolean;
  sections: unknown;
  createdAt: Date;
};

export function ProposalTemplateList({ initialTemplates }: { initialTemplates: Template[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const utils = trpc.useUtils();
  const { data: templates } = trpc.proposalTemplates.list.useQuery(undefined, {
    initialData: initialTemplates,
  });

  const deleteMutation = trpc.proposalTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted");
      utils.proposalTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (creating || editing) {
    return (
      <ProposalTemplateForm
        templateId={editing ?? undefined}
        onDone={() => {
          setEditing(null);
          setCreating(false);
          utils.proposalTemplates.list.invalidate();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => setCreating(true)}>
        <Plus className="mr-2 h-4 w-4" /> New Template
      </Button>

      {templates?.length === 0 && (
        <p className="text-muted-foreground text-sm">No templates yet. Create one to get started.</p>
      )}

      <div className="space-y-2">
        {templates?.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <span className="font-medium">{t.name}</span>
              {t.isDefault && <Badge variant="secondary">Default</Badge>}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(t.id)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm("Delete this template?")) {
                    deleteMutation.mutate({ id: t.id });
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
