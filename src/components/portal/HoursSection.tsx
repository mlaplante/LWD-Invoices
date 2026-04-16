import { listPortalRetainers } from "@/server/services/portal-hours-retainers";
import { db } from "@/server/db";
import { HoursRetainerCard } from "./HoursRetainerCard";

export async function HoursSection({ clientId }: { clientId: string }) {
  const retainers = await listPortalRetainers(db, clientId);
  if (retainers.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Hours</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {retainers.map((r) => (
          <HoursRetainerCard key={r.id} r={r} />
        ))}
      </div>
    </section>
  );
}
