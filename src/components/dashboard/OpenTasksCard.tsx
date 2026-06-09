import { CheckSquare } from "lucide-react";
import Link from "next/link";

type Props = {
  data: { openCount: number };
};

export function OpenTasksCard({ data }: Props) {
  const { openCount } = data;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-blue-500" />
          Open Tasks
        </h3>
        {openCount > 0 && (
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700">
            {openCount} task{openCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {openCount === 0 ? (
        <p className="text-sm text-muted-foreground">No open tasks</p>
      ) : (
        <div className="space-y-2">
          <p className="text-3xl font-bold">{openCount}</p>
          <p className="text-xs text-muted-foreground">incomplete tasks across all projects</p>
          <Link
            href="/projects"
            className="text-xs text-blue-600 hover:underline font-medium"
          >
            View all projects →
          </Link>
        </div>
      )}
    </div>
  );
}
