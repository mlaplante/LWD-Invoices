import { api } from "@/trpc/server";
import { ProjectForm } from "@/components/projects/ProjectForm";

export default async function NewProjectPage() {
  const [clients, currencies, templates] = await Promise.all([
    api.clients.list({ includeArchived: false }),
    api.currencies.list(),
    api.projectTemplates.list(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">New Project</h1>
      <ProjectForm mode="create" clients={clients} currencies={currencies} templates={templates} />
    </div>
  );
}
