import { FolderOpen } from "lucide-react";
import { formatDate } from "@/lib/format";

type ProjectRow = {
  id: string;
  name: string;
  status: string;
  dueDate: string | null;
  projectedHours: number;
};

type Props = {
  projects: ProjectRow[];
};

export function DashboardProjects({ projects }: Props) {
  if (projects.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <h2 className="text-base font-semibold text-foreground mb-4">
        Active Projects
      </h2>
      <div className="space-y-3">
        {projects.map((project) => (
          <div
            key={project.id}
            className="flex items-start gap-3 rounded-xl border border-border/50 p-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
              <FolderOpen className="h-4 w-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground text-sm truncate">
                {project.name}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                {project.dueDate && (
                  <span>Due {formatDate(project.dueDate)}</span>
                )}
                {project.projectedHours > 0 && (
                  <span>{project.projectedHours}h projected</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
