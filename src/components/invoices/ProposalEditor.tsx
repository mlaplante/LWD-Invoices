"use client";

import { useState, useEffect, useTransition } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MarkdownPreview } from "@/components/ui/markdown-preview";
import { toast } from "sonner";
import { Download, Trash2, Eye, Pencil } from "lucide-react";

type Section = { key: string; title: string; content: string | null };

export function ProposalEditor({ invoiceId }: { invoiceId: string }) {
  const { data: proposal, isLoading } = trpc.proposals.get.useQuery({ invoiceId });
  const [sections, setSections] = useState<Section[]>([]);
  const [isPending, startTransition] = useTransition();
  const [previewing, setPreviewing] = useState<string | null>(null);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (proposal) {
      setSections(proposal.sections as Section[]);
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

  function updateSection(index: number, content: string) {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, content } : s))
    );
  }

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

      {sections.map((section, i) => (
        <div key={section.key} className="space-y-1">
          <div className="flex items-center justify-between">
            <Label>{section.title}</Label>
            {section.key !== "budget" && section.content && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPreviewing(previewing === section.key ? null : section.key)}
              >
                {previewing === section.key ? (
                  <><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</>
                ) : (
                  <><Eye className="h-3.5 w-3.5 mr-1.5" />Preview</>
                )}
              </Button>
            )}
          </div>
          {section.key === "budget" ? (
            <p className="text-sm text-muted-foreground">
              Auto-generated from estimate line items.
            </p>
          ) : previewing === section.key ? (
            <MarkdownPreview content={section.content ?? ""} />
          ) : (
            <Textarea
              rows={6}
              value={section.content ?? ""}
              onChange={(e) => updateSection(i, e.target.value)}
              placeholder="Supports **bold**, ## headings, - bullets, and | tables |"
            />
          )}
        </div>
      ))}

      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? "Saving..." : "Save Proposal"}
      </Button>
    </div>
  );
}
