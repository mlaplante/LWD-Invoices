"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  FileText,
  FolderKanban,
  Plus,
  Receipt,
  Search,
  Settings,
  Ticket,
  Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/trpc/client";
import { VisuallyHidden } from "radix-ui";

const QUICK_ACTIONS = [
  { label: "New Invoice", href: "/invoices/new", icon: Plus },
  { label: "New Client", href: "/clients/new", icon: Plus },
  { label: "New Project", href: "/projects/new", icon: Plus },
  { label: "New Expense", href: "/expenses/new", icon: Plus },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Team", href: "/settings/team", icon: Users },
  { label: "Reports", href: "/reports", icon: BarChart3 },
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd+K / Ctrl+K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Debounce query
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  const { data } = trpc.search.global.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );

  const navigate = useCallback(
    (href: string) => {
      setQuery("");
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const hasResults =
    data &&
    (data.invoices.length > 0 ||
      data.clients.length > 0 ||
      data.projects.length > 0 ||
      data.expenses.length > 0 ||
      data.tickets.length > 0);

  const showResults = debouncedQuery.length >= 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="p-0 overflow-hidden max-w-lg"
      >
        <VisuallyHidden.Root>
          <DialogTitle>Search</DialogTitle>
        </VisuallyHidden.Root>
        <Command shouldFilter={false} className="flex flex-col">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search or jump to..."
              className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="pointer-events-none ml-2 inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            {/* Empty state */}
            {showResults && !hasResults && (
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                No results found.
              </Command.Empty>
            )}
            {!showResults && query.length > 0 && query.length < 2 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Type to search…
              </div>
            )}

            {/* Quick Actions (when no query) */}
            {!showResults && (
              <Command.Group heading="Quick Actions">
                {QUICK_ACTIONS.map((action) => (
                  <Command.Item
                    key={action.href}
                    value={action.label}
                    onSelect={() => navigate(action.href)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent"
                  >
                    <action.icon className="h-4 w-4 text-muted-foreground" />
                    {action.label}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Search Results */}
            {showResults && data && (
              <>
                {data.invoices.length > 0 && (
                  <Command.Group heading="Invoices">
                    {data.invoices.map((inv) => (
                      <Command.Item
                        key={inv.id}
                        value={`invoice-${inv.id}`}
                        onSelect={() => navigate(`/invoices/${inv.id}`)}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 truncate">
                          {inv.number} — {inv.client.name}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {inv.status.toLowerCase()}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {data.clients.length > 0 && (
                  <Command.Group heading="Clients">
                    {data.clients.map((client) => (
                      <Command.Item
                        key={client.id}
                        value={`client-${client.id}`}
                        onSelect={() => navigate(`/clients/${client.id}`)}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent"
                      >
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{client.name}</span>
                        {client.email && (
                          <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {client.email}
                          </span>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {data.projects.length > 0 && (
                  <Command.Group heading="Projects">
                    {data.projects.map((proj) => (
                      <Command.Item
                        key={proj.id}
                        value={`project-${proj.id}`}
                        onSelect={() => navigate(`/projects/${proj.id}`)}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent"
                      >
                        <FolderKanban className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{proj.name}</span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {proj.status.toLowerCase()}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {data.expenses.length > 0 && (
                  <Command.Group heading="Expenses">
                    {data.expenses.map((exp) => (
                      <Command.Item
                        key={exp.id}
                        value={`expense-${exp.id}`}
                        onSelect={() => navigate(`/expenses/${exp.id}`)}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent"
                      >
                        <Receipt className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 truncate">
                          {exp.name}
                          {exp.supplier ? ` — ${exp.supplier.name}` : ""}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {data.tickets.length > 0 && (
                  <Command.Group heading="Tickets">
                    {data.tickets.map((ticket) => (
                      <Command.Item
                        key={ticket.id}
                        value={`ticket-${ticket.id}`}
                        onSelect={() => navigate(`/tickets/${ticket.id}`)}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent"
                      >
                        <Ticket className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 truncate">
                          #{ticket.number} {ticket.subject}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {ticket.status.toLowerCase()}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function SearchTriggerButton() {
  return (
    <button
      type="button"
      onClick={() =>
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true })
        )
      }
      className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Search…</span>
      <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        ⌘K
      </kbd>
    </button>
  );
}
