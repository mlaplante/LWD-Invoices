"use client";

import Link from "next/link";
import { Fragment } from "react";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS, isNavItemActive, type NavItem } from "@/lib/nav-items";
import { cn } from "@/lib/utils";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isNavItemActive(item.href, pathname);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150",
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

  return (
    <nav
      aria-label="Primary navigation"
      className="flex min-h-0 flex-1 flex-col gap-0.5"
    >
      {NAV_SECTIONS.map((section) => (
        <Fragment key={section.title}>
          <p className="px-3 pt-4 pb-1 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/30">
            {section.title}
          </p>
          {section.items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </Fragment>
      ))}
    </nav>
  );
}
