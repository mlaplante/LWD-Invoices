"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  Users,
  UsersRound,
  Wallet,
  MoreHorizontal,
  FolderOpen,
  Clock,
  Package,
  BarChart2,
  LifeBuoy,
  Settings,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/expenses", label: "Expenses", icon: Wallet },
];

const moreItems = [
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/timesheets", label: "Timesheets", icon: Clock },
  { href: "/items", label: "Items", icon: Package },
  { href: "/reports", label: "Reports", icon: BarChart2 },
  { href: "/tickets", label: "Tickets", icon: LifeBuoy },
  { href: "/settings/team", label: "Team", icon: UsersRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav({ orgName }: { orgName?: string | null }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  const moreActive = moreItems.some((item) => isActive(item.href));

  return (
    <>
      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Slide-up drawer */}
      <div
        className={cn(
          "lg:hidden fixed inset-x-0 bottom-0 z-50 bg-sidebar rounded-t-[28px]",
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          drawerOpen ? "translate-y-0" : "translate-y-full"
        )}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-sidebar-foreground/20" />
        </div>

        {/* New Invoice CTA */}
        <div className="px-5 pt-2 pb-5">
          <Link
            href="/invoices/new"
            onClick={() => setDrawerOpen(false)}
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-2xl py-3.5 text-sm font-semibold shadow-lg shadow-primary/25 active:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            New Invoice
          </Link>
        </div>

        {/* Secondary nav grid */}
        <div className="px-4 grid grid-cols-3 gap-2 pb-5">
          {moreItems.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setDrawerOpen(false)}
                className={cn(
                  "flex flex-col items-center gap-2 py-4 rounded-2xl transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/50 active:bg-sidebar-accent/40"
                )}
              >
                <Icon className={cn("w-5 h-5", active && "text-primary")} />
                <span className="text-[11px] font-semibold">{label}</span>
              </Link>
            );
          })}
        </div>

        {/* Org pill */}
        {orgName && (
          <div className="mx-4 border-t border-sidebar-border pt-4">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-sidebar-accent">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0 text-[11px] font-bold text-primary-foreground">
                {orgName.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs text-sidebar-foreground/70 font-medium truncate">
                {orgName}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom tab bar */}
      <div
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-sidebar/95 backdrop-blur-xl border-t border-sidebar-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <nav className="flex items-stretch h-16">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors duration-150",
                  active ? "text-primary" : "text-sidebar-foreground/35"
                )}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full bg-primary" />
                )}
                <Icon className="w-[19px] h-[19px]" />
                <span className="text-[10px] font-semibold tracking-wide">{label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setDrawerOpen((o) => !o)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors duration-150",
              moreActive ? "text-primary" : "text-sidebar-foreground/35"
            )}
          >
            {moreActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full bg-primary" />
            )}
            <MoreHorizontal className="w-[19px] h-[19px]" />
            <span className="text-[10px] font-semibold tracking-wide">More</span>
          </button>
        </nav>
      </div>
    </>
  );
}
