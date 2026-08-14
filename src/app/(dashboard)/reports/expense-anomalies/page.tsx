import { api, HydrateClient } from "@/trpc/server";
import { ExpenseAnomaliesClient } from "./ExpenseAnomaliesClient";

export const dynamic = "force-dynamic";

export default async function ExpenseAnomaliesPage() {
  void api.analytics.expenseAnomalies.prefetch();

  return (
    <HydrateClient>
      <ExpenseAnomaliesClient />
    </HydrateClient>
  );
}
