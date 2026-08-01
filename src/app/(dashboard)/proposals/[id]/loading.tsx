import { Skeleton } from "@/components/ui/skeleton";

export default function ProposalDetailLoading() {
  return (
    <div aria-busy="true" aria-label="Loading proposal" className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-20 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
        <div className="space-y-3 border-b border-border/50 px-8 py-7">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-4 w-4/5 max-w-lg" />
        </div>
        <div className="space-y-4 px-8 py-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex justify-between border-b border-border/40 py-4">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-20 w-full" />
      </div>
    </div>
  );
}
