import { api, HydrateClient } from "@/trpc/server";
import { ClientHealthClient } from "./ClientHealthClient";

export const dynamic = "force-dynamic";

// Server shell: start the client-health scoring during the RSC render instead of
// after hydration. `prefetch()` with no argument mirrors the client's
// `useQuery()` with no argument — the two must agree, since a no-input key and
// an empty-object key are not the same (see src/test/prefetch-query-keys.test.ts).
export default async function ClientHealthPage() {
  void api.analytics.clientHealth.prefetch();

  return (
    <HydrateClient>
      <ClientHealthClient />
    </HydrateClient>
  );
}
