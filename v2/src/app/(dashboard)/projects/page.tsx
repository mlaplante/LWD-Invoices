import { api } from "@/trpc/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ProjectStatus } from "@/generated/prisma";

const STATUS_COLORS: Record<ProjectStatus, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  ARCHIVED: "bg-gray-100 text-gray-500",
};

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type Project = {
  id: string;
  name: string;
  status: ProjectStatus;
  dueDate: Date | null;
  client: { id: string; name: string };
  currency: { id: string; symbol: string; symbolPosition: string };
  _count: { tasks: number; timeEntries: number; expenses: number };
};

function ProjectTable({ items }: { items: Project[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground px-1">None</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Name</th>
            <th className="px-4 py-3 text-left font-medium">Client</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-left font-medium">Due</th>
            <th className="px-4 py-3 text-right font-medium">Tasks</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((p) => (
            <tr key={p.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3 font-medium">
                <Link href={`/projects/${p.id}`} className="hover:underline">
                  {p.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{p.client.name}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status]}`}
                >
                  {p.status}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(p.dueDate)}</td>
              <td className="px-4 py-3 text-right text-muted-foreground">
                {p._count.tasks}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/projects/${p.id}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ProjectsPage() {
  const projects = await api.projects.list({ includeArchived: false });

  const active = projects.filter((p) => p.status === "ACTIVE");
  const completed = projects.filter((p) => p.status === "COMPLETED");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Button asChild>
          <Link href="/projects/new">New Project</Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="text-lg font-medium">No projects yet</p>
          <p className="mt-1 text-sm">Create your first project to get started.</p>
          <Button asChild className="mt-4">
            <Link href="/projects/new">Create Project</Link>
          </Button>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Active</h2>
            <ProjectTable items={active} />
          </section>
          {completed.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Completed</h2>
              <ProjectTable items={completed} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
