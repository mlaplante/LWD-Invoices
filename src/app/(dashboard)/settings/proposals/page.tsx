import { api } from "@/trpc/server";
import { ProposalTemplateList } from "@/components/settings/ProposalTemplateList";

export default async function ProposalTemplatesSettingsPage() {
  const templates = await api.proposalTemplates.list();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Proposal Templates</h1>
        <p className="text-muted-foreground">
          Manage reusable proposal templates for your estimates.
        </p>
      </div>
      <ProposalTemplateList initialTemplates={templates} />
    </div>
  );
}
