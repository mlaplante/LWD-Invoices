import { api, HydrateClient } from "@/trpc/server";
import { Form1099Client } from "./Form1099Client";

export const dynamic = "force-dynamic";

// The client defaults its year selector to the current year, so that is the one
// variant worth prefetching; picking another year is a deliberate user action
// and fetches on demand. Input shape must match the client's useQuery exactly.
export default async function Form1099Page() {
  void api.contractors.list.prefetch({
    includeArchived: false,
    year: new Date().getFullYear(),
  });

  return (
    <HydrateClient>
      <Form1099Client />
    </HydrateClient>
  );
}
