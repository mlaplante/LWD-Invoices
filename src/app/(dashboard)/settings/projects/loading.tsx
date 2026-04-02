import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectSettingsLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-6 w-36" />
      </div>
      <div className="rounded-2xl border border-border/50 overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50 space-y-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-72" />
        </div>
        <div className="px-6 py-6 space-y-5">
          {/* Task statuses */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-28" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 flex-1 rounded-lg" />
                <Skeleton className="h-9 w-9 rounded-lg" />
              </div>
            ))}
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
          <div className="h-px bg-border/50" />
          {/* Templates */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-36" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 flex-1 rounded-lg" />
                <Skeleton className="h-9 w-9 rounded-lg" />
              </div>
            ))}
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
