"use client";

import { useState } from "react";
import Link from "next/link";
import { OrgSwitcher } from "@/components/layout/OrgSwitcher";
import { usePathname } from "next/navigation";
import { Wallet, Clock, Plus, Send } from "lucide-react";
import { MOBILE_TABS, NAV_HUBS, isNavItemActive } from "@/lib/nav-items";
import { cn } from "@/lib/utils";
import {
  QuickExpenseSheet,
  SendReminderInvoicePicker,
  StartTimerFlow,
} from "@/components/actions";

const mobileTabHrefs = new Set(MOBILE_TABS.map((item) => item.href));

// Everything the four tabs don't already reach, grouped by hub. The sheet
// is the only way to these routes on mobile, so nothing may be dropped.
const sheetHubs = NAV_HUBS.map((hub) => ({
  ...hub,
  items: (hub.items.length
    ? hub.items
    : [{ href: hub.href, label: hub.label, icon: hub.icon }]
  ).filter((item) => !mobileTabHrefs.has(item.href)),
})).filter((hub) => hub.items.length > 0);

type MobileAction = "expense" | "reminder" | "timer" | null;

/**
 * Bottom tab bar per the repo's MOBILE_TABS, split by a 52px indigo FAB
 * that overlaps the bar by 30px. The FAB opens the New Invoice sheet —
 * New Invoice is its headline action, with the other quick actions and
 * the full hub nav below it, since the sheet is mobile's only route to
 * the destinations the four tabs don't cover.
 *
 * Every tap target is at least 44px tall.
 */
export function MobileNav({ activeOrgId }: { activeOrgId?: string }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [action, setAction] = useState<MobileAction>(null);
  const pathname = usePathname();

  const isActive = (href: string) => isNavItemActive(href, pathname);
  const [leftTabs, rightTabs] = [MOBILE_TABS.slice(0, 2), MOBILE_TABS.slice(2)];

  return (
    <>
      {sheetOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSheetOpen(false)}
        />
      )}

      {/* New Invoice sheet */}
      <div
        id="mobile-navigation-menu"
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 rounded-t-[24px] bg-card lg:hidden",
          "max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain",
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          sheetOpen ? "translate-y-0" : "translate-y-full",
        )}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}
      >
        <button
          type="button"
          onClick={() => setSheetOpen(false)}
          aria-label="Close menu"
          className="sticky top-0 z-10 flex w-full justify-center rounded-t-[24px] bg-card pb-2 pt-3"
        >
          <div className="h-1 w-9 rounded-full bg-foreground/15" />
        </button>

        <div className="px-5 pb-5 pt-2">
          <Link
            href="/invoices/new"
            onClick={() => setSheetOpen(false)}
            className="flex items-center justify-center gap-2 rounded-[6px] bg-primary py-3.5 text-[11px] font-semibold uppercase tracking-[2px] text-primary-foreground shadow-[0_4px_15px_rgba(63,81,181,0.4)]"
          >
            <Plus className="size-4" />
            New Invoice
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          {(
            [
              { key: "expense", icon: Wallet, label: "Log expense" },
              { key: "timer", icon: Clock, label: "Start timer" },
              { key: "reminder", icon: Send, label: "Send reminder" },
            ] as const
          ).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => {
                setSheetOpen(false);
                setAction(key);
              }}
              className="flex min-h-[44px] flex-col items-center gap-2 rounded-[10px] py-4 text-muted-foreground active:bg-accent"
            >
              <Icon className="size-5" />
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          ))}
        </div>

        <div className="space-y-4 px-4 pb-5">
          {sheetHubs.map((hub) => (
            <section key={hub.id}>
              <p className="px-1 pb-2 font-mono text-[9.5px] uppercase tracking-[1.5px] text-muted-foreground">
                {hub.label}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {hub.items.map(({ href, label, icon: Icon }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setSheetOpen(false)}
                      className={cn(
                        "flex min-h-[44px] flex-col items-center gap-2 rounded-[10px] px-1 py-4 text-center transition-colors",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground active:bg-accent",
                      )}
                    >
                      <Icon className="size-5" />
                      <span className="text-[11px] font-medium leading-tight">
                        {label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {activeOrgId && (
          <div className="mx-4">
            <OrgSwitcher currentOrgId={activeOrgId} />
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <nav
          aria-label="Mobile navigation"
          className="flex items-center justify-around px-2 pb-2 pt-2.5"
        >
          {leftTabs.map((tab) => (
            <Tab key={tab.href} {...tab} active={isActive(tab.href)} />
          ))}

          <button
            type="button"
            onClick={() => setSheetOpen((open) => !open)}
            aria-controls="mobile-navigation-menu"
            aria-expanded={sheetOpen}
            aria-label="New invoice"
            className="-mt-[30px] flex size-[52px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_4px_15px_rgba(63,81,181,0.4)] transition-transform duration-200 ease-[ease] active:scale-95"
          >
            <Plus className="size-6" />
          </button>

          {rightTabs.map((tab) => (
            <Tab key={tab.href} {...tab} active={isActive(tab.href)} />
          ))}
        </nav>
      </div>

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

function Tab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[44px] min-w-[56px] flex-col items-center justify-center gap-1 transition-colors duration-200 ease-[ease]",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-[17px]" />
      <span className={cn("text-[9px]", active ? "font-medium" : "font-normal")}>
        {label}
      </span>
    </Link>
  );
}
