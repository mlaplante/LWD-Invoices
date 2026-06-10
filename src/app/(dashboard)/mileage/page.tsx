import { api, HydrateClient } from "@/trpc/server";
import { MileageTracker } from "@/components/mileage/MileageTracker";

export const metadata = { title: "Mileage" };
export const dynamic = "force-dynamic";

export default async function MileagePage() {
  void api.mileage.list.prefetch({});
  void api.mileage.summary.prefetch();

  return (
    <HydrateClient>
      <MileageTracker />
    </HydrateClient>
  );
}
