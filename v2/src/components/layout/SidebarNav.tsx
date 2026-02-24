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
  BarChart2,
  LifeBuoy,
  Settings,
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
];

const secondaryNav: NavItem[] = [
  { href: "/reports", label: "Reports", icon: BarChart2 },
  { href: "/tickets", label: "Tickets", icon: LifeBuoy },
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
        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
        active
          ? "bg-accent text-primary"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <Icon
        className={cn(
          "w-4 h-4 shrink-0",
          active ? "text-primary" : "text-muted-foreground/70"
        )}
      />
      {item.label}
    </Link>
  );
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 flex-1">
      {primaryNav.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}
      <div className="my-2 h-px bg-border" />
      {secondaryNav.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}
    </nav>
  );
}
