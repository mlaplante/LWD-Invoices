"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { NAV_SECTIONS, isNavItemActive, type NavItem } from "@/lib/nav-items";
import { cn } from "@/lib/utils";

const COLLAPSED_STORAGE_KEY = "lwd:sidebar-collapsed";
// Settings/Team stay reachable without scrolling: this section is pinned
// below the scroll region instead of rendered inside it.
const PINNED_SECTION_TITLE = "Admin";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isNavItemActive(item.href, pathname);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-150",
        active
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground/80",
      )}
    >
      <Icon
        className={cn(
          "w-4 h-4 shrink-0",
          active ? "opacity-100" : "opacity-60",
        )}
      />
      <span className="flex-1">{item.label}</span>
      {active && (
        <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-sm shadow-primary/50" />
      )}
    </Link>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  // Server render always shows every section expanded; the stored preference
  // is applied after hydration to avoid an SSR/client markup mismatch.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (stored) setCollapsed(new Set(JSON.parse(stored) as string[]));
    } catch {
      // Corrupt or unavailable storage just means "everything expanded".
    }
  }, []);

  const toggleSection = (title: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      try {
        window.localStorage.setItem(
          COLLAPSED_STORAGE_KEY,
          JSON.stringify([...next]),
        );
      } catch {
        // Persistence is best-effort; the toggle still works for the session.
      }
      return next;
    });
  };

  const scrollSections = NAV_SECTIONS.filter(
    (section) => section.title !== PINNED_SECTION_TITLE,
  );
  const pinnedSection = NAV_SECTIONS.find(
    (section) => section.title === PINNED_SECTION_TITLE,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav
        aria-label="Primary navigation"
        className="sidebar-scroll -mr-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-2"
      >
        {scrollSections.map((section) => {
          const isCollapsed = collapsed.has(section.title);
          const containsActive = section.items.some((item) =>
            isNavItemActive(item.href, pathname),
          );
          const panelId = `sidebar-section-${section.title.replace(/\W+/g, "-").toLowerCase()}`;

          return (
            <section key={section.title}>
              <button
                type="button"
                onClick={() => toggleSection(section.title)}
                aria-expanded={!isCollapsed}
                aria-controls={panelId}
                className="flex w-full items-center gap-1.5 rounded-md px-3 pt-3 pb-1 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/30 transition-colors hover:text-sidebar-foreground/60"
              >
                <span>{section.title}</span>
                {isCollapsed && containsActive && (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full bg-primary shadow-sm shadow-primary/50"
                  />
                )}
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "ml-auto h-3 w-3 transition-transform duration-200",
                    isCollapsed && "-rotate-90",
                  )}
                />
              </button>
              <div
                id={panelId}
                className={cn(
                  "grid transition-[grid-template-rows] duration-200",
                  isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
                )}
              >
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {section.items.map((item) => (
                    <NavLink key={item.href} item={item} pathname={pathname} />
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </nav>

      {pinnedSection && (
        <div className="mt-2 flex flex-col gap-0.5 border-t border-sidebar-border pt-2">
          {pinnedSection.items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  );
}
