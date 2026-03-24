"use client";

import { useState, useEffect, useTransition } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type Section = { key: string; title: string; content: string | null };

const DEFAULT_SECTIONS: Section[] = [
  { key: "executive_summary", title: "Executive Summary", content: "" },
  { key: "developer_profile", title: "Developer Profile", content: "" },
  { key: "technologies", title: "Technologies & Approach", content: "" },
  { key: "budget", title: "Budget", content: null },
  { key: "production_process", title: "Production Process", content: "" },
  { key: "assumptions", title: "Details and Assumptions", content: "" },
  { key: "terms", title: "Terms of Agreement", content: "" },
];

export function ProposalTemplateForm({
  templateId,
  onDone,
}: {
  templateId?: string;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [sections, setSections] = useState<Section[]>(DEFAULT_SECTIONS);
  const [isDefault, setIsDefault] = useState(false);
  const [isPending, startTransition] = useTransition();

  const { data: template } = trpc.proposalTemplates.get.useQuery(
    { id: templateId! },
    { enabled: !!templateId }
  );

  useEffect(() => {
    if (template) {
      setName(template.name);
      setSections(template.sections as Section[]);
      setIsDefault(template.isDefault);
    }
  }, [template]);

  const createMutation = trpc.proposalTemplates.create.useMutation({
    onSuccess: () => { toast.success("Template created"); onDone(); },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.proposalTemplates.update.useMutation({
    onSuccess: () => { toast.success("Template updated"); onDone(); },
    onError: (err) => toast.error(err.message),
  });

  function updateSection(index: number, content: string) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, content } : s)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(() => {
      if (templateId) {
        updateMutation.mutate({ id: templateId, name, sections, isDefault });
      } else {
        createMutation.mutate({ name, sections, isDefault });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {templateId ? "Edit Template" : "New Template"}
        </h2>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Template Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Web Redesign Proposal"
          required
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch id="isDefault" checked={isDefault} onCheckedChange={setIsDefault} />
        <Label htmlFor="isDefault">Set as default template</Label>
      </div>

      <div className="space-y-4">
        {sections.map((section, i) => (
          <div key={section.key} className="space-y-1">
            <Label>{section.title}</Label>
            {section.key === "budget" ? (
              <p className="text-sm text-muted-foreground">
                Auto-generated from estimate line items.
              </p>
            ) : (
              <Textarea
                rows={8}
                value={section.content ?? ""}
                onChange={(e) => updateSection(i, e.target.value)}
                placeholder={`Markdown content for ${section.title}...`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : templateId ? "Update Template" : "Create Template"}
        </Button>
      </div>
    </form>
  );
}
