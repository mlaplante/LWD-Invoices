import { Skeleton } from "@/components/ui/skeleton";

export default function ForecastLoading() {
  return (
    <div aria-busy="true" aria-label="Loading revenue forecast" className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
      <Skeleton className="h-9 w-40 rounded-lg" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-[10px] border border-border bg-card p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-24" />
          </div>
        ))}
      </div>
      <div className="rounded-[10px] border border-border bg-card p-6">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-5 h-40 w-full" />
      </div>
      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
