import { api } from "@/trpc/server";
import { ProposalWizard } from "@/components/proposals/ProposalWizard";

export default async function NewProposalPage() {
  const [clientsResult, projectsResult, templates] = await Promise.all([
    api.clients.list({ includeArchived: false, pageSize: 100 }),
    api.projects.list({ includeArchived: false, pageSize: 100 }),
    api.proposalTemplates.list(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Proposal</h1>
        <p className="text-sm text-muted-foreground">Pick a client, then let AI draft the proposal.</p>
      </div>
      <ProposalWizard
        clients={clientsResult.items.map((c) => ({ id: c.id, name: c.name }))}
        projects={projectsResult.items.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId }))}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          isDefault: t.isDefault,
          sections: t.sections as { key: string; title: string; content: string }[],
        }))}
      />
    </div>
  );
}
