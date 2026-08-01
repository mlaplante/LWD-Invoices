import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Banknote,
  BarChart2,
  CalendarCheck,
  Car,
  Clock,
  Contact,
  FileText,
  HandCoins,
  FolderOpen,
  GitMerge,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  Package,
  Receipt,
  Settings,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavSection = { title: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Work",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/invoices", label: "Invoices", icon: Receipt },
      { href: "/proposals", label: "Proposals", icon: FileText },
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/projects", label: "Projects", icon: FolderOpen },
      { href: "/timesheets", label: "Timesheets", icon: Clock },
      { href: "/items", label: "Items", icon: Package },
      { href: "/expenses", label: "Expenses", icon: Wallet },
      { href: "/mileage", label: "Mileage", icon: Car },
      { href: "/contractors", label: "Contractors", icon: Contact },
    ],
  },
  {
    title: "Money Ops",
    items: [
      { href: "/collections", label: "Collections", icon: Banknote },
      { href: "/reconciliation", label: "Reconciliation", icon: GitMerge },
      { href: "/disputes", label: "Disputes", icon: ShieldAlert },
      { href: "/month-end-close", label: "Month-end close", icon: CalendarCheck },
      {
        href: "/money-intelligence",
        label: "Money Intelligence",
        icon: TrendingUp,
      },
      { href: "/reports", label: "Reports", icon: BarChart2 },
    ],
  },
  {
    title: "Inbox & AI",
    items: [
      { href: "/assistant", label: "Ask AI", icon: Sparkles },
      { href: "/replies", label: "Reply triage", icon: MessageSquare },
      { href: "/activity", label: "Activity", icon: Activity },
      { href: "/tickets", label: "Tickets", icon: LifeBuoy },
      { href: "/invoices/unpaid", label: "Unpaid", icon: HandCoins },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/settings/team", label: "Team", icon: UsersRound },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const ALL_NAV_HREFS = NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => item.href),
);

// Longest-match wins: a parent link (e.g. /settings) stays inactive when a
// more specific nav destination (e.g. /settings/team) also matches the path.
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  if (pathname !== href && !pathname.startsWith(`${href}/`)) return false;
  return !ALL_NAV_HREFS.some(
    (other) =>
      other.length > href.length &&
      (pathname === other || pathname.startsWith(`${other}/`)),
  );
}

export const MOBILE_TABS: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/expenses", label: "Expenses", icon: Wallet },
];
