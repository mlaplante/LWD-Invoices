import { api } from "@/trpc/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";

// Generate consistent initials + color from a name
function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const AVATAR_COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
  "bg-indigo-100 text-indigo-700",
];

function avatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

const PAGE_SIZE = 25;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: rawPage } = await searchParams;
  const page = Math.max(1, parseInt(rawPage ?? "1", 10));
  const clients = await api.clients.list({ includeArchived: false });

  const totalPages = Math.ceil(clients.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(totalPages, 1));
  const start = (currentPage - 1) * PAGE_SIZE;
  const paginated = clients.slice(start, start + PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Page heading */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
        <Button asChild size="sm">
          <Link href="/clients/new">+ New Client</Link>
        </Button>
      </div>

      {clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mb-4">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <p className="font-semibold text-foreground">No clients yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first client to get started.
          </p>
          <Button asChild className="mt-5" size="sm">
            <Link href="/clients/new">Add Client</Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide pl-2">
                  Client
                </th>
                <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Phone
                </th>
                <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Location
                </th>
                <th className="pb-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginated.map((client) => (
                <tr
                  key={client.id}
                  className="group hover:bg-accent/30 transition-colors"
                >
                  {/* Avatar + name/email */}
                  <td className="py-3.5 pl-2">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${avatarColor(client.name)}`}
                      >
                        {initials(client.name)}
                      </div>
                      <div>
                        <Link
                          href={`/clients/${client.id}`}
                          className="font-semibold text-foreground hover:text-primary transition-colors leading-tight"
                        >
                          {client.name}
                        </Link>
                        {client.email && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {client.email}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Phone */}
                  <td className="py-3.5 text-muted-foreground">
                    {client.phone ?? "—"}
                  </td>

                  {/* Location */}
                  <td className="py-3.5 text-muted-foreground">
                    {[client.city, client.country].filter(Boolean).join(", ") ||
                      "—"}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 pr-2">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <Link
                        href={`/clients/${client.id}`}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                      >
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border/40 px-2 py-3 text-sm text-muted-foreground">
              <span>
                Showing {start + 1}–{Math.min(start + PAGE_SIZE, clients.length)} of {clients.length}
              </span>
              <div className="flex items-center gap-1">
                {currentPage > 1 && (
                  <Link
                    href={`/clients?page=${currentPage - 1}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent/80 transition-colors"
                  >
                    Previous
                  </Link>
                )}
                <span className="px-3 py-1.5 text-xs">
                  Page {currentPage} of {totalPages}
                </span>
                {currentPage < totalPages && (
                  <Link
                    href={`/clients?page=${currentPage + 1}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent/80 transition-colors"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
