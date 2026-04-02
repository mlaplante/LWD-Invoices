import { Skeleton } from "@/components/ui/skeleton";

export default function InvoiceEditLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-32" />
      </div>
      <div className="rounded-2xl border border-border/50 overflow-hidden">
        <div className="px-8 py-6 border-b border-border/50 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
        <div className="px-8 py-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-9 flex-1 rounded-lg" />
              <Skeleton className="h-9 w-20 rounded-lg" />
              <Skeleton className="h-9 w-24 rounded-lg" />
              <Skeleton className="h-9 w-8 rounded-lg" />
            </div>
          ))}
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="px-8 py-4 border-t border-border/50 flex justify-end gap-2">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
