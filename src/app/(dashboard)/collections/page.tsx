import { api, HydrateClient } from "@/trpc/server";
import { CollectionsQueue } from "@/components/collections/CollectionsQueue";

export const metadata = { title: "Collections" };
export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  void api.collections.queue.prefetch({ limit: 50 });

  return (
    <HydrateClient>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Collections</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Your ranked daily queue — highest-risk receivables first. One click to chase, AI-drafted
            reminder reviewed before sending.
          </p>
        </div>
        <CollectionsQueue />
      </div>
    </HydrateClient>
  );
}
