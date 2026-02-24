import { api } from "@/trpc/server";
import { ProjectSettingsForm } from "@/components/settings/ProjectSettingsForm";

export default async function ProjectSettingsPage() {
  const [taskStatuses, templates] = await Promise.all([
    api.taskStatuses.list(),
    api.projectTemplates.list(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Project Settings</h1>
      <ProjectSettingsForm taskStatuses={taskStatuses} templates={templates} />
    </div>
  );
}
