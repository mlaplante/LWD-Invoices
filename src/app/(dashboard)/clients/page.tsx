import { api } from "@/trpc/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Users, HeartHandshake, Tag } from "lucide-react";
import { SearchInput } from "@/components/ui/SearchInput";
import { ClientImportExportButtons } from "@/components/clients/ClientImportExportButtons";
import { Suspense } from "react";
import { cn } from "@/lib/utils";
import {
  ClientBehaviorPill,
  ClientHealthBar,
} from "@/components/clients/ClientHealthBar";

// Generate consistent initials + color from a name
function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Avatars are tinted from the system palette rather than a rainbow, so the
// only colour that carries meaning in the row is the health bar.
const AVATAR_COLORS = [
  "bg-primary/12 text-primary dark:bg-primary/25 dark:text-accent-foreground",
  "bg-black/[0.06] text-muted-foreground dark:bg-white/10",
];

function avatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

const PAGE_SIZE = 25;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; tag?: string }>;
}) {
  const { page: rawPage, search, tag } = await searchParams;
  const page = Math.max(1, parseInt(rawPage ?? "1", 10));
  const [{ items: paginated, total }, usedTags, health] = await Promise.all([
    api.clients.list({
      includeArchived: false,
      search: search || undefined,
      tag: tag || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    api.clients.usedTags(),
    // Cached org-wide (5-min TTL), so this doesn't scale with page size.
    api.analytics.clientHealth(),
  ]);

  const healthById = new Map(health.scores.map((s) => [s.clientId, s]));
  const totalsById = health.totals;
  const totalOpenAr = Object.values(totalsById).reduce(
    (sum, t) => sum + t.openAr,
    0,
  );

  const listParams = (p: number) => {
    const qs = new URLSearchParams();
    if (p > 1) qs.set("page", String(p));
    if (search) qs.set("search", search);
    if (tag) qs.set("tag", tag);
    const s = qs.toString();
    return s ? `?${s}` : "";
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(totalPages, 1));
  const start = (currentPage - 1) * PAGE_SIZE;
  const hasFilters = Boolean(search || tag);

  return (
    <div className="space-y-5">
      {/* Page heading */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[28px]">Clients</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Suspense>
            <SearchInput placeholder="Search clients…" />
          </Suspense>
          <Button asChild variant="outline" size="sm">
            <Link href="/clients/retention">
              <HeartHandshake className="w-4 h-4 mr-1.5" />
              Retention
            </Link>
          </Button>
          <ClientImportExportButtons />
          <Button asChild size="sm">
            <Link href="/clients/new">+ New Client</Link>
          </Button>
        </div>
      </div>

      {/* Tag filter chips */}
      {usedTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-muted-foreground" />
          {usedTags.map(({ tag: t, count }) => (
            <Link
              key={t}
              href={
                tag?.toLowerCase() === t.toLowerCase()
                  ? "/clients"
                  : `/clients?tag=${encodeURIComponent(t)}`
              }
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                tag?.toLowerCase() === t.toLowerCase()
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent text-muted-foreground hover:text-foreground",
              )}
            >
              {t} <span className="opacity-60">{count}</span>
            </Link>
          ))}
          {tag && (
            <Link
              href="/clients"
              className="text-xs text-muted-foreground underline ml-1"
            >
              Clear
            </Link>
          )}
        </div>
      )}

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-[10px] bg-accent flex items-center justify-center mb-4">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <p className="font-semibold text-foreground">
            {hasFilters ? "No clients match these filters" : "No clients yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasFilters
              ? "Try clearing a filter or changing your search."
              : "Add your first client to get started."}
          </p>
          {hasFilters ? (
            <Button asChild className="mt-5" size="sm" variant="outline">
              <Link href="/clients">Clear filters</Link>
            </Button>
          ) : (
            <Button asChild className="mt-5" size="sm">
              <Link href="/clients/new">New Client</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="sm:hidden divide-y divide-divider">
            {paginated.map((client) => (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                className="flex items-center gap-3 py-3.5 px-2 hover:bg-accent/30 transition-colors"
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${avatarColor(client.name)}`}
                >
                  {initials(client.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight truncate">
                    {client.name}
                  </p>
                  {client.email && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {client.email}
                    </p>
                  )}
                </div>
                <div className="text-xs text-muted-foreground shrink-0 text-right">
                  {client.phone && <p>{client.phone}</p>}
                  <p>
                    {[client.city, client.country].filter(Boolean).join(", ") ||
                      ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop table — health and payment behaviour lead, because
              "who is at risk" is the question this list actually answers. */}
          <div className="hidden overflow-hidden rounded-[10px] border border-border bg-card sm:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Health</th>
                    <th>Behavior</th>
                    <th className="text-right">Open AR</th>
                    <th className="text-right">Revenue · 180d</th>
                    <th>Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((client) => {
                    const health = healthById.get(client.id);
                    const totals = totalsById[client.id];
                    const signal = health?.signals[0];
                    return (
                      <tr key={client.id} className="group">
                        <td>
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex size-[34px] shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(client.name)}`}
                            >
                              {initials(client.name)}
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/clients/${client.id}`}
                                className="font-medium text-foreground transition-colors hover:text-primary"
                              >
                                {client.name}
                              </Link>
                              <p className="font-mono text-[10px] text-muted-foreground">
                                {client.email ??
                                  [client.city, client.country]
                                    .filter(Boolean)
                                    .join(", ") ??
                                  "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>
                          {health ? (
                            <ClientHealthBar
                              score={health.score}
                              band={health.band}
                              lowData={health.lowData}
                            />
                          ) : (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                        <td>
                          <ClientBehaviorPill
                            band={health?.band ?? "stable"}
                            isNew={!health}
                          />
                        </td>
                        <td
                          className={cn(
                            "text-right font-semibold tabular-nums",
                            totals?.openAr ? "text-danger-foreground" : "",
                          )}
                        >
                          {money(totals?.openAr ?? 0)}
                        </td>
                        <td className="text-right font-mono text-xs tabular-nums">
                          {money(totals?.revenue180d ?? 0)}
                        </td>
                        <td className="max-w-[220px]">
                          {signal ? (
                            <span
                              className={cn(
                                "text-[11px]",
                                health?.band === "critical" ||
                                  health?.band === "at_risk"
                                  ? "text-danger-foreground"
                                  : "text-primary dark:text-accent-foreground",
                              )}
                            >
                              {signal}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer stats — the mono strip that closes every list view */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10.5px] text-muted-foreground">
            <span>
              {total} active client{total === 1 ? "" : "s"}
            </span>
            <span aria-hidden>·</span>
            <span>open ar {money(totalOpenAr)}</span>
            <span aria-hidden>·</span>
            <span>health scores recomputed nightly</span>
          </div>

          {/* Pagination footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-2 py-3 text-sm text-muted-foreground">
              <span>
                Showing {start + 1}–{Math.min(start + PAGE_SIZE, total)} of{" "}
                {total}
              </span>
              <div className="flex items-center gap-1">
                {currentPage > 1 && (
                  <Link
                    href={`/clients${listParams(currentPage - 1)}`}
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
                    href={`/clients${listParams(currentPage + 1)}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent/80 transition-colors"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
