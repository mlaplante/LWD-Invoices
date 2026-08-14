import { api, HydrateClient } from "@/trpc/server";
import { UnpaidInvoicesList } from "@/components/invoices/UnpaidInvoicesList";

export const dynamic = "force-dynamic";

/**
 * Server shell so the open-invoice query runs during the RSC render rather than
 * after hydration. `prefetch({})` mirrors the client's `useQuery({})` exactly —
 * the inputs must match or the query keys diverge, the hydrated entry is ignored,
 * and the page pays for the query twice.
 */
export default async function UnpaidInvoicesPage() {
  void api.invoices.openForReminder.prefetch({});

  return (
    <HydrateClient>
      <UnpaidInvoicesList />
    </HydrateClient>
  );
}
