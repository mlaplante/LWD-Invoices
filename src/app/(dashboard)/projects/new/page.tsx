import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProjectForm } from "@/components/projects/ProjectForm";

export default async function NewProjectPage() {
  const [{ items: clients }, currencies, templates] = await Promise.all([
    api.clients.list({ includeArchived: false, pageSize: 100 }),
    api.currencies.list(),
    api.projectTemplates.list(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/projects"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Projects
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight">New Project</h1>
      </div>
      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <ProjectForm mode="create" clients={clients} currencies={currencies} templates={templates} />
      </div>
    </div>
  );
}
