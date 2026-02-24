import Link from "next/link";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { Plus } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 flex flex-col p-5 gap-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-1 mb-7">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
            <span className="text-primary-foreground text-sm font-black tracking-tight">
              L
            </span>
          </div>
          <span className="font-extrabold text-[17px] text-foreground tracking-tight">
            LWD Invoices
          </span>
        </div>

        {/* New Invoice CTA */}
        <Link
          href="/invoices/new"
          className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-2xl py-3 mb-6 text-sm font-semibold hover:opacity-90 transition-opacity shadow-md shadow-primary/25"
        >
          <Plus className="w-4 h-4" />
          New Invoice
        </Link>

        {/* Navigation */}
        <SidebarNav />

        {/* Org switcher at bottom */}
        <div className="mt-auto pt-3 border-t border-border/60">
          <OrganizationSwitcher
            appearance={{
              elements: {
                rootBox: "w-full",
                organizationSwitcherTrigger:
                  "w-full justify-start gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors",
              },
            }}
          />
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 p-5 pl-0">
        {/* Top bar */}
        <header className="flex items-center justify-end gap-3 mb-5 px-1">
          <NotificationBell />
          <UserButton />
        </header>

        {/* White content card */}
        <main className="flex-1 bg-card rounded-2xl shadow-sm ring-1 ring-border/40 overflow-auto">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
