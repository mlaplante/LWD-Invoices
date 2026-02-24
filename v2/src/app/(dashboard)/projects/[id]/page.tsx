import { api } from "@/trpc/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TaskList } from "@/components/projects/TaskList";
import { TimeTab } from "@/components/projects/TimeTab";
import { ExpensesTab } from "@/components/projects/ExpensesTab";
import { AttachmentPanel } from "@/components/attachments/AttachmentPanel";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab = "tasks" } = await searchParams;

  let project;
  try {
    project = await api.projects.get({ id });
  } catch {
    notFound();
  }

  const tabs = [
    { key: "tasks", label: "Tasks" },
    { key: "time", label: "Time" },
    { key: "expenses", label: "Expenses" },
    { key: "files", label: "Files" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/projects" className="hover:underline">
              Projects
            </Link>
            <span>/</span>
            <span>{project.client.name}</span>
          </div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.description && (
            <p className="mt-1 text-muted-foreground text-sm">{project.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/projects/${id}/edit`}>Edit</Link>
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="mt-1 font-semibold">{project.status}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Tasks</p>
          <p className="mt-1 font-semibold">{project._count.tasks}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Time Logged</p>
          <p className="mt-1 font-semibold">
            {(project.summary.totalMinutes / 60).toFixed(1)}h
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Expenses</p>
          <p className="mt-1 font-semibold">
            {project.currency.symbol}{project.summary.totalExpenses.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-6">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/projects/${id}?tab=${t.key}`}
              className={`py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {tab === "tasks" && <TaskList project={project} />}
      {tab === "time" && <TimeTab projectId={id} />}
      {tab === "expenses" && <ExpensesTab projectId={id} />}
      {tab === "files" && (
        <div className="rounded-lg border p-4">
          <AttachmentPanel context="PROJECT" contextId={id} />
        </div>
      )}
    </div>
  );
}
