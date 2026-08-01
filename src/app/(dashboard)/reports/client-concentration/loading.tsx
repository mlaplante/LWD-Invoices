import { Skeleton } from "@/components/ui/skeleton";

export default function ClientConcentrationLoading() {
  return (
    <div aria-busy="true" aria-label="Loading client concentration report" className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
      <Skeleton className="h-9 w-72 rounded-lg" />
      <div className="rounded-2xl border border-border/50 bg-card p-5">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="mt-2 h-4 w-3/4" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-border/50 bg-card p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
        <div className="space-y-2 border-b border-border/50 px-6 py-4">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-5 w-48" />
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="grid grid-cols-4 items-center gap-4 border-b border-border/40 px-6 py-3.5 last:border-0">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-16 justify-self-end" />
            <Skeleton className="h-4 w-20 justify-self-end" />
            <Skeleton className="h-4 w-16 justify-self-end" />
          </div>
        ))}
      </div>
    </div>
  );
}
