import { api } from "@/trpc/server";
import Link from "next/link";
import { ProjectSettingsForm } from "@/components/settings/ProjectSettingsForm";
import { ArrowLeft } from "lucide-react";

export default async function ProjectSettingsPage() {
  const [taskStatuses, templates] = await Promise.all([
    api.taskStatuses.list(),
    api.projectTemplates.list(),
  ]);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/settings"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight truncate">
          Project Settings
        </h1>
      </div>

      {/* Content card */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Project Settings
          </p>
          <p className="text-base font-semibold mt-1">Task Statuses &amp; Templates</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure default task statuses and reusable project templates.
          </p>
        </div>
        <div className="px-6 py-6">
          <ProjectSettingsForm taskStatuses={taskStatuses} templates={templates} />
        </div>
      </div>
    </div>
  );
}
