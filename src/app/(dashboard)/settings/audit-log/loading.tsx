import { Skeleton } from "@/components/ui/skeleton";

export default function AuditLogLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-6 w-28" />
      </div>
      <div className="rounded-2xl border border-border/50 overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50 space-y-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-64" />
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-6 py-3.5 border-b border-border/40">
            <Skeleton className="h-6 w-20 rounded-lg shrink-0" />
            <Skeleton className="h-4 w-16 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-3 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
