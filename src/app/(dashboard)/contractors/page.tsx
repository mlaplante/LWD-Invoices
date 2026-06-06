import { api, HydrateClient } from "@/trpc/server";
import { ContractorList } from "@/components/contractors/ContractorList";

export const dynamic = "force-dynamic";

export default async function ContractorsPage() {
  void api.contractors.list.prefetch({ includeArchived: false });

  return (
    <HydrateClient>
      <ContractorList />
    </HydrateClient>
  );
}
