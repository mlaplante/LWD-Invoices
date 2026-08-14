import { api, HydrateClient } from "@/trpc/server";
import { RetainerDetailClient } from "./RetainerDetailClient";

export const dynamic = "force-dynamic";

// Route params are already available here, so the retainer detail can be fetched
// during the RSC render rather than after hydration. The client component now
// takes plain string props instead of resolving the params promise itself.
export default async function RetainerDetailPage({
  params,
}: {
  params: Promise<{ id: string; retainerId: string }>;
}) {
  const { id: clientId, retainerId } = await params;
  void api.hoursRetainers.getDetail.prefetch({ id: retainerId });

  return (
    <HydrateClient>
      <RetainerDetailClient clientId={clientId} retainerId={retainerId} />
    </HydrateClient>
  );
}
