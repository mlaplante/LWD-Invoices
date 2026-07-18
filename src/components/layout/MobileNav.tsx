"use client";

import { useState } from "react";
import Link from "next/link";
import { OrgSwitcher } from "@/components/layout/OrgSwitcher";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  FileText,
  Users,
  UsersRound,
  Wallet,
  MoreHorizontal,
  FolderOpen,
  Clock,
  Package,
  Contact,
  BarChart2,
  LifeBuoy,
  Settings,
  Sparkles,
  ShieldAlert,
  CalendarCheck,
  Activity,
  Banknote,
  TrendingUp,
  GitMerge,
  MessageSquare,
  Car,
  Plus,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  QuickExpenseSheet,
  SendReminderInvoicePicker,
  StartTimerFlow,
} from "@/components/actions";

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
  { href: "/mileage", label: "Mileage", icon: Car },
  { href: "/contractors", label: "Contractors", icon: Contact },
  { href: "/assistant", label: "Ask AI", icon: Sparkles },
  { href: "/activity", label: "Activity", icon: Activity },
  {
    href: "/money-intelligence",
    label: "Money Intelligence",
    icon: TrendingUp,
  },
  { href: "/reports", label: "Reports", icon: BarChart2 },
  { href: "/month-end-close", label: "Month-end close", icon: CalendarCheck },
  { href: "/disputes", label: "Disputes", icon: ShieldAlert },
  { href: "/invoices/unpaid", label: "Unpaid", icon: Receipt },
  { href: "/proposals", label: "Proposals", icon: FileText },
  { href: "/collections", label: "Collections", icon: Banknote },
  { href: "/replies", label: "Reply triage", icon: MessageSquare },
  { href: "/reconciliation", label: "Reconciliation", icon: GitMerge },
  { href: "/tickets", label: "Tickets", icon: LifeBuoy },
  { href: "/settings/team", label: "Team", icon: UsersRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

type MobileAction = "expense" | "reminder" | "timer" | null;

export function MobileNav({
  orgName,
  activeOrgId,
}: {
  orgName?: string | null;
  activeOrgId?: string;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [action, setAction] = useState<MobileAction>(null);
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
          className="lg:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Slide-up drawer */}
      <div
        id="mobile-navigation-menu"
        className={cn(
          "lg:hidden fixed inset-x-0 bottom-0 z-40 bg-sidebar rounded-t-[28px]",
          "max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain",
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          drawerOpen ? "translate-y-0" : "translate-y-full",
        )}
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        {/* Drag handle — tappable close target, pinned while the drawer scrolls */}
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          className="sticky top-0 z-10 w-full flex justify-center pt-3 pb-2 bg-sidebar rounded-t-[28px]"
        >
          <div className="w-9 h-1 rounded-full bg-sidebar-foreground/20" />
        </button>

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

        {/* Quick actions — shared action primitives */}
        <div className="px-4 grid grid-cols-3 gap-2 pb-3">
          <button
            onClick={() => {
              setDrawerOpen(false);
              setAction("expense");
            }}
            className="flex flex-col items-center gap-2 py-4 rounded-2xl text-sidebar-foreground/70 active:bg-sidebar-accent/40"
          >
            <Wallet className="w-5 h-5" />
            <span className="text-[11px] font-semibold">Log expense</span>
          </button>
          <button
            onClick={() => {
              setDrawerOpen(false);
              setAction("timer");
            }}
            className="flex flex-col items-center gap-2 py-4 rounded-2xl text-sidebar-foreground/70 active:bg-sidebar-accent/40"
          >
            <Clock className="w-5 h-5" />
            <span className="text-[11px] font-semibold">Start timer</span>
          </button>
          <button
            onClick={() => {
              setDrawerOpen(false);
              setAction("reminder");
            }}
            className="flex flex-col items-center gap-2 py-4 rounded-2xl text-sidebar-foreground/70 active:bg-sidebar-accent/40"
          >
            <Send className="w-5 h-5" />
            <span className="text-[11px] font-semibold">Send reminder</span>
          </button>
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
                    : "text-sidebar-foreground/50 active:bg-sidebar-accent/40",
                )}
              >
                <Icon className={cn("w-5 h-5", active && "text-primary")} />
                <span className="text-[11px] font-semibold">{label}</span>
              </Link>
            );
          })}
        </div>

        {/* Org switcher */}
        {activeOrgId && (
          <div className="mx-4">
            <OrgSwitcher currentOrgId={activeOrgId} />
          </div>
        )}
      </div>

      {/* Bottom tab bar */}
      <div
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-sidebar/95 backdrop-blur-xl border-t border-sidebar-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <nav aria-label="Mobile navigation" className="flex items-stretch h-16">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setDrawerOpen(false)}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors duration-150",
                  active ? "text-primary" : "text-sidebar-foreground/35",
                )}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full bg-primary" />
                )}
                <Icon className="w-[19px] h-[19px]" />
                <span className="text-[10px] font-semibold tracking-wide">
                  {label}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setDrawerOpen((o) => !o)}
            aria-controls="mobile-navigation-menu"
            aria-expanded={drawerOpen}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors duration-150",
              moreActive ? "text-primary" : "text-sidebar-foreground/35",
            )}
          >
            {moreActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full bg-primary" />
            )}
            <MoreHorizontal className="w-[19px] h-[19px]" />
            <span className="text-[10px] font-semibold tracking-wide">
              More
            </span>
          </button>
        </nav>
      </div>

      {/* Action primitives (shared with command palette) */}
      <QuickExpenseSheet
        open={action === "expense"}
        onOpenChange={(o) => !o && setAction(null)}
      />
      <StartTimerFlow
        open={action === "timer"}
        onOpenChange={(o) => !o && setAction(null)}
      />
      <SendReminderInvoicePicker
        open={action === "reminder"}
        onOpenChange={(o) => !o && setAction(null)}
      />
    </>
  );
}
