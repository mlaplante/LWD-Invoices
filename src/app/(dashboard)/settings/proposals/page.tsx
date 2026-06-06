import { api } from "@/trpc/server";
import { ProposalTemplateList } from "@/components/settings/ProposalTemplateList";
import { ProposalNudgeSettings } from "@/components/settings/ProposalNudgeSettings";

export default async function ProposalTemplatesSettingsPage() {
  const [templates, org] = await Promise.all([
    api.proposalTemplates.list(),
    api.organization.get(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Proposal Templates</h1>
        <p className="text-muted-foreground">
          Manage reusable proposal templates for your estimates.
        </p>
      </div>
      <ProposalTemplateList initialTemplates={templates} />
      <ProposalNudgeSettings
        initialEnabled={org.proposalNudgeEnabled}
        initialDelayHours={org.proposalNudgeDelayHours}
      />
    </div>
  );
}
