import { Skeleton } from "@/components/ui/skeleton";

export default function TimesheetsLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-32" />
      <div className="rounded-2xl border border-border/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50 space-y-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-3">
            <Skeleton className="h-9 w-40 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-border/40">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
