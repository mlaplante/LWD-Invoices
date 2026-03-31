"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Receipt,
  Users,
  FolderOpen,
  Clock,
  Package,
  Wallet,
  BarChart2,
  LifeBuoy,
  Settings,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const primaryNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/timesheets", label: "Timesheets", icon: Clock },
  { href: "/items", label: "Items", icon: Package },
  { href: "/expenses", label: "Expenses", icon: Wallet },
];

const secondaryNav: NavItem[] = [
  { href: "/reports", label: "Reports", icon: BarChart2 },
  { href: "/tickets", label: "Tickets", icon: LifeBuoy },
  { href: "/settings/team", label: "Team", icon: UsersRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active =
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150",
        active
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground/80"
      )}
    >
      <Icon className={cn("w-4 h-4 shrink-0", active ? "opacity-100" : "opacity-60")} />
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
    <nav className="flex flex-col gap-0.5 flex-1">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30 px-2 mb-1">
        Main
      </p>

      {primaryNav.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}

      <div className="h-px bg-sidebar-border my-2" />

      <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30 px-2 mb-1">
        Analytics
      </p>

      {secondaryNav.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}
    </nav>
  );
}
