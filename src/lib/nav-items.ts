import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Banknote,
  BarChart2,
  Braces,
  CalendarCheck,
  Car,
  Clock,
  Contact,
  FileText,
  FolderOpen,
  GitMerge,
  HeartPulse,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  Package,
  Plug,
  Receipt,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
  UsersRound,
  Wallet,
  Workflow,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/**
 * A hub is a top-level rail entry. Its `items` are revealed as indented
 * sub-nav only while that hub is the active one — the redesign's core
 * move, collapsing 23 flat links into 7 destinations.
 *
 * `href` is where clicking the hub itself lands. For hubs that are pure
 * groupings (Money, AI) that's the first sub-item's route.
 */
export type NavHub = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  items: NavItem[];
};

export const NAV_HUBS: NavHub[] = [
  {
    id: "home",
    label: "Home",
    href: "/",
    icon: LayoutDashboard,
    items: [],
  },
  {
    id: "invoices",
    label: "Invoices",
    href: "/invoices",
    icon: Receipt,
    items: [
      { href: "/invoices", label: "All invoices", icon: Receipt },
      { href: "/proposals", label: "Proposals", icon: FileText },
      { href: "/items", label: "Item library", icon: Package },
    ],
  },
  {
    id: "clients",
    label: "Clients",
    href: "/clients",
    icon: Users,
    items: [
      { href: "/clients", label: "All clients", icon: Users },
      { href: "/contractors", label: "Contractors", icon: Contact },
      { href: "/clients/retention", label: "Retention", icon: HeartPulse },
    ],
  },
  {
    id: "work",
    label: "Work",
    href: "/projects",
    icon: FolderOpen,
    items: [
      { href: "/projects", label: "Projects", icon: FolderOpen },
      { href: "/timesheets", label: "Timesheets", icon: Clock },
      { href: "/expenses", label: "Expenses", icon: Wallet },
      { href: "/mileage", label: "Mileage", icon: Car },
    ],
  },
  {
    id: "money",
    label: "Money",
    href: "/reports",
    icon: Banknote,
    items: [
      { href: "/collections", label: "Collections", icon: Banknote },
      { href: "/reconciliation", label: "Reconciliation", icon: GitMerge },
      { href: "/month-end-close", label: "Month-end close", icon: CalendarCheck },
      { href: "/reports", label: "Reports", icon: BarChart2 },
      { href: "/disputes", label: "Disputes", icon: ShieldAlert },
    ],
  },
  {
    id: "ai",
    label: "AI",
    href: "/assistant",
    icon: Sparkles,
    items: [
      { href: "/assistant", label: "Ask Your Books", icon: Sparkles },
      { href: "/settings/briefing", label: "Weekly briefing", icon: FileText },
      { href: "/replies", label: "Reply triage", icon: MessageSquare },
      { href: "/money-intelligence", label: "Insights", icon: Sparkles },
      { href: "/activity", label: "Activity", icon: Activity },
      { href: "/tickets", label: "Tickets", icon: LifeBuoy },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: Settings,
    items: [
      { href: "/settings", label: "Organization", icon: Settings },
      { href: "/settings/team", label: "Team", icon: UsersRound },
      { href: "/settings/connections", label: "Connections", icon: Plug },
      { href: "/settings/automations", label: "Automations", icon: Workflow },
      { href: "/settings/estimated-tax", label: "Taxes & currency", icon: Banknote },
      { href: "/settings/security", label: "Security", icon: ShieldAlert },
      { href: "/settings/audit-log", label: "Audit log", icon: Braces },
    ],
  },
];

/**
 * Flat list of every destination the rail can reach, used for
 * longest-match active detection and by the command palette.
 */
const ALL_NAV_HREFS = Array.from(
  new Set(
    NAV_HUBS.flatMap((hub) => [hub.href, ...hub.items.map((item) => item.href)]),
  ),
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

/**
 * Which hub owns the current route. Drives both the rail's active state
 * and which sub-nav is expanded — the design never expands more than one.
 *
 * Matched by longest prefix across all of a hub's routes so that, say,
 * /settings/team resolves to Settings rather than falling through, and
 * /clients/retention resolves to Clients rather than to Home.
 */
export function activeHubId(pathname: string): string {
  if (pathname === "/") return "home";

  let bestHub = "home";
  let bestLength = 0;

  for (const hub of NAV_HUBS) {
    if (hub.id === "home") continue;
    const routes = [hub.href, ...hub.items.map((item) => item.href)];
    for (const route of routes) {
      if (route === "/") continue;
      const matches = pathname === route || pathname.startsWith(`${route}/`);
      if (matches && route.length > bestLength) {
        bestLength = route.length;
        bestHub = hub.id;
      }
    }
  }

  return bestHub;
}

/**
 * Grouped view of the hubs, kept for the command palette which lists
 * every destination at once rather than progressively revealing them.
 */
export type NavSection = { title: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = NAV_HUBS.map((hub) => ({
  title: hub.label,
  items: hub.items.length
    ? hub.items
    : [{ href: hub.href, label: hub.label, icon: hub.icon }],
}));

/** Bottom tab bar. The centre `+` FAB sits between Invoices and Clients. */
export const MOBILE_TABS: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/expenses", label: "Expenses", icon: Wallet },
];
