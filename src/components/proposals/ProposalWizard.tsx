"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ProposalSectionsEditor, type ProposalSection } from "@/components/proposals/ProposalSectionsEditor";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

type Client = { id: string; name: string };
type Project = { id: string; name: string; clientId: string };
type Template = { id: string; name: string; isDefault: boolean; sections: ProposalSection[] };
type SuggestedItem = { itemId: string; name: string; quantity: number; rate: number };

export function ProposalWizard({
  clients, projects, templates,
}: {
  clients: Client[];
  projects: Project[];
  templates: Template[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [templateId, setTemplateId] = useState(templates.find((t) => t.isDefault)?.id ?? "");
  const [sections, setSections] = useState<ProposalSection[]>([]);
  const [items, setItems] = useState<(SuggestedItem & { accepted: boolean })[]>([]);

  const clientProjects = projects.filter((p) => p.clientId === clientId);

  // The chosen template (explicit, else org default) — the scaffold both the AI
  // path conforms to and the AI-unavailable path falls back to.
  function resolveTemplate(): Template | undefined {
    return templates.find((t) => t.id === templateId) ?? templates.find((t) => t.isDefault);
  }

  const generate = trpc.proposals.generateDraft.useMutation({
    onSuccess: (res) => {
      if (!res.draft) {
        // AI off/invalid: proceed with the template's own sections (matches the
        // spec's "plain template" fallback), not an empty editor.
        const tmpl = resolveTemplate();
        if (!tmpl) {
          toast.error("No template available — create one in Settings → Proposals.");
          return; // stay on step 1; nothing to edit
        }
        toast.message("AI is unavailable — starting from the template.");
        setSections(tmpl.sections.map((s) => ({ ...s })));
        setItems([]);
      } else {
        setSections(res.draft.sections as ProposalSection[]);
        setItems(res.draft.suggestedItems.map((i) => ({ ...i, accepted: true })));
      }
      setStep(2);
    },
    onError: (err) => toast.error(err.message),
  });

  const create = trpc.proposals.createFromWizard.useMutation({
    onSuccess: ({ invoiceId }) => {
      toast.success("Proposal created");
      router.push(`/proposals/${invoiceId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  function handleGenerate() {
    generate.mutate({
      clientId,
      projectId: projectId || undefined,
      templateId: templateId || undefined,
    });
  }

  function handleSave() {
    create.mutate({
      clientId,
      projectId: projectId || null,
      templateId: templateId || undefined,
      sections: sections.map((s) => ({ key: s.key, title: s.title, content: s.content ?? "" })),
      lineItems: items.filter((i) => i.accepted).map((i) => ({
        name: i.name, qty: i.quantity, rate: i.rate, sourceId: i.itemId,
      })),
    });
  }

  if (step === 1) {
    return (
      <div className="max-w-xl space-y-5">
        <div className="space-y-1.5">
          <Label>Client</Label>
          <Select value={clientId} onValueChange={(v) => { setClientId(v); setProjectId(""); }}>
            <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {clientProjects.length > 0 && (
          <div className="space-y-1.5">
            <Label>Project (optional)</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
              <SelectContent>
                {clientProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Template (optional)</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger><SelectValue placeholder="Org default" /></SelectTrigger>
            <SelectContent>
              {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleGenerate} disabled={!clientId || generate.isPending}>
          <Sparkles className="mr-2 h-4 w-4" />
          {generate.isPending ? "Generating…" : "Generate with AI"}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-4 rounded-lg border p-4">
        <ProposalSectionsEditor sections={sections} onChange={setSections} />
      </div>

      {items.length > 0 && (
        <div className="space-y-2 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Suggested line items</h3>
          {items.map((it, i) => (
            <label key={it.itemId} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={it.accepted}
                  onChange={(e) => setItems((prev) => prev.map((p, j) => j === i ? { ...p, accepted: e.target.checked } : p))}
                />
                {it.name}
              </span>
              <span className="flex items-center gap-2 text-muted-foreground">
                <Input
                  type="number"
                  className="h-8 w-20"
                  value={it.quantity}
                  onChange={(e) => setItems((prev) => prev.map((p, j) => j === i ? { ...p, quantity: Number(e.target.value) } : p))}
                />
                × {it.rate.toFixed(2)}
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
        <Button onClick={handleSave} disabled={create.isPending}>
          {create.isPending ? "Saving…" : "Save proposal"}
        </Button>
      </div>
    </div>
  );
}
