import { api } from "@/trpc/server";
import { notFound } from "next/navigation";
import { ProjectForm } from "@/components/projects/ProjectForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProjectPage({ params }: Props) {
  const { id } = await params;

  const [project, clients, currencies] = await Promise.all([
    api.projects.get({ id }).catch(() => null),
    api.clients.list({ includeArchived: false }),
    api.currencies.list(),
  ]);

  if (!project) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Edit Project</h1>
      <ProjectForm
        mode="edit"
        project={project}
        clients={clients}
        currencies={currencies}
        templates={[]}
      />
    </div>
  );
}
