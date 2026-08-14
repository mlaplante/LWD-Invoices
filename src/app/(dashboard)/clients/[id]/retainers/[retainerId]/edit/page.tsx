import { api, HydrateClient } from "@/trpc/server";
import { RetainerEditClient } from "./RetainerEditClient";

export const dynamic = "force-dynamic";

export default async function EditRetainerPage({
  params,
}: {
  params: Promise<{ id: string; retainerId: string }>;
}) {
  const { id: clientId, retainerId } = await params;
  void api.hoursRetainers.getDetail.prefetch({ id: retainerId });

  return (
    <HydrateClient>
      <RetainerEditClient clientId={clientId} retainerId={retainerId} />
    </HydrateClient>
  );
}
