"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  NAV_HUBS,
  activeHubId,
  isNavItemActive,
  type NavHub,
} from "@/lib/nav-items";
import { cn } from "@/lib/utils";

/**
 * The rail: seven hubs, paper-white. Only the active hub reveals its
 * sub-nav, so the list never exceeds ~13 rows even at its tallest.
 *
 * Expansion is derived from the pathname rather than held in state —
 * there is no way to expand a hub you are not inside, which is what
 * keeps the rail short.
 */
export function SidebarNav({ invoiceBadge }: { invoiceBadge?: number }) {
  const pathname = usePathname();
  const activeHub = activeHubId(pathname);

  return (
    <nav
      aria-label="Primary navigation"
      className="sidebar-scroll -mr-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-2"
    >
      {NAV_HUBS.map((hub) => (
        <HubRow
          key={hub.id}
          hub={hub}
          expanded={activeHub === hub.id}
          pathname={pathname}
          badge={hub.id === "invoices" ? invoiceBadge : undefined}
        />
      ))}
    </nav>
  );
}

function HubRow({
  hub,
  expanded,
  pathname,
  badge,
}: {
  hub: NavHub;
  expanded: boolean;
  pathname: string;
  badge?: number;
}) {
  const Icon = hub.icon;
  // A hub with sub-nav showing is already "current" via its sub-item, so
  // aria-current goes on whichever row is the precise destination.
  const selfIsCurrent = isNavItemActive(hub.href, pathname);

  return (
    <>
      <Link
        href={hub.href}
        aria-current={selfIsCurrent ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors duration-200 ease-[ease]",
          expanded
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.04]",
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1">{hub.label}</span>
        {badge ? (
          <span className="rounded-full bg-primary/10 px-[7px] py-px font-mono text-[10px] font-medium text-primary">
            {badge}
          </span>
        ) : null}
      </Link>

      {expanded && hub.items.length > 0 && (
        <div className="mb-1 mt-0.5 flex flex-col gap-px pl-[26px]">
          {hub.items.map((item) => {
            const active = isNavItemActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-[5px] px-2.5 py-[5px] text-xs transition-colors duration-200 ease-[ease]",
                  active
                    ? "font-medium text-primary"
                    : "text-muted-foreground hover:bg-black/[0.03] hover:text-foreground dark:hover:bg-white/[0.03]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
