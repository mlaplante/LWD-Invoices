import { Skeleton } from "@/components/ui/skeleton";

export default function PaymentsSettingsLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="rounded-2xl border border-border/50 overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50 space-y-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-72" />
        </div>
        <div className="px-6 py-6 space-y-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-5 w-24" />
                </div>
                <Skeleton className="h-6 w-12 rounded-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
