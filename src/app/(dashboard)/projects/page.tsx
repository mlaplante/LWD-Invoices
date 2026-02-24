import { api } from "@/trpc/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ProjectStatus } from "@/generated/prisma";
import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<ProjectStatus, { label: string; className: string }> = {
  ACTIVE:    { label: "Active",    className: "bg-emerald-50 text-emerald-600" },
  COMPLETED: { label: "Completed", className: "bg-primary/10 text-primary" },
  ARCHIVED:  { label: "Archived",  className: "bg-gray-100 text-gray-500" },
};

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Consistent folder color from project name
const FOLDER_COLORS = [
  "bg-violet-100 text-violet-600",
  "bg-blue-100 text-blue-600",
  "bg-emerald-100 text-emerald-600",
  "bg-amber-100 text-amber-600",
  "bg-rose-100 text-rose-600",
  "bg-cyan-100 text-cyan-600",
  "bg-orange-100 text-orange-600",
  "bg-indigo-100 text-indigo-600",
];

function folderColor(name: string): string {
  return FOLDER_COLORS[name.charCodeAt(0) % FOLDER_COLORS.length];
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

// ── Tab config ────────────────────────────────────────────────────────────────

type Tab = "all" | "active" | "completed";

const TABS: { id: Tab; label: string }[] = [
  { id: "all",       label: "All Projects" },
  { id: "active",    label: "Active" },
  { id: "completed", label: "Completed" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { tab: rawTab, page: rawPage } = await searchParams;
  const activeTab: Tab =
    rawTab === "active" || rawTab === "completed" ? rawTab : "all";
  const page = Math.max(1, parseInt(rawPage ?? "1", 10));

  const projects = await api.projects.list({ includeArchived: false });

  const filtered: Project[] =
    activeTab === "active"
      ? projects.filter((p) => p.status === "ACTIVE")
      : activeTab === "completed"
      ? projects.filter((p) => p.status === "COMPLETED")
      : projects;

  const PAGE_SIZE = 25;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(totalPages, 1));
  const start = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(start, start + PAGE_SIZE);
  const tabParam = activeTab !== "all" ? `tab=${activeTab}&` : "";

  return (
    <div className="space-y-5">
      {/* Page heading */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
        <Button asChild size="sm">
          <Link href="/projects/new">+ New Project</Link>
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "all" ? "/projects" : `/projects?tab=${t.id}`}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors relative",
              activeTab === t.id
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {activeTab === t.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </Link>
        ))}
      </div>

      {/* Project table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mb-4">
            <FolderOpen className="w-6 h-6 text-primary" />
          </div>
          <p className="font-semibold text-foreground">
            {activeTab === "all" ? "No projects yet" : `No ${activeTab} projects`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first project to get started.
          </p>
          {activeTab === "all" && (
            <Button asChild className="mt-5" size="sm">
              <Link href="/projects/new">Create Project</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide pl-2">
                  Project
                </th>
                <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Due Date
                </th>
                <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Status
                </th>
                <th className="pb-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Tasks
                </th>
                <th className="pb-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginated.map((p) => {
                const badge = STATUS_BADGE[p.status];
                return (
                  <tr
                    key={p.id}
                    className="group hover:bg-accent/30 transition-colors"
                  >
                    {/* Folder icon + name/client */}
                    <td className="py-3.5 pl-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                            folderColor(p.name)
                          )}
                        >
                          <FolderOpen className="w-4 h-4" />
                        </div>
                        <div>
                          <Link
                            href={`/projects/${p.id}`}
                            className="font-semibold text-foreground hover:text-primary transition-colors leading-tight"
                          >
                            {p.name}
                          </Link>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {p.client.name}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Due date */}
                    <td className="py-3.5 text-muted-foreground">
                      {formatDate(p.dueDate)}
                    </td>

                    {/* Status */}
                    <td className="py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold",
                          badge.className
                        )}
                      >
                        {badge.label}
                      </span>
                    </td>

                    {/* Task count */}
                    <td className="py-3.5 text-right text-muted-foreground tabular-nums">
                      {p._count.tasks}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 pr-2">
                      <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          href={`/projects/${p.id}`}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                        >
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Pagination footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border/40 px-2 py-3 text-sm text-muted-foreground">
              <span>
                Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                {currentPage > 1 && (
                  <Link
                    href={`/projects?${tabParam}page=${currentPage - 1}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent/80 transition-colors"
                  >
                    Previous
                  </Link>
                )}
                <span className="px-3 py-1.5 text-xs">
                  Page {currentPage} of {totalPages}
                </span>
                {currentPage < totalPages && (
                  <Link
                    href={`/projects?${tabParam}page=${currentPage + 1}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent/80 transition-colors"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
