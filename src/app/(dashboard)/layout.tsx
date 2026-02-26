import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "@/components/layout/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { MobileNav } from "@/components/layout/MobileNav";
import { db } from "@/server/db";
import { Plus } from "lucide-react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const orgId = user?.app_metadata?.organizationId as string | undefined;
  const orgName = orgId
    ? (await db.organization.findUnique({ where: { id: orgId }, select: { name: true } }))?.name
    : null;

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Desktop sidebar (hidden on mobile) ──────────────── */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col p-4 gap-0 bg-sidebar">
        <div className="flex items-center gap-2.5 px-2 mb-6">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm shadow-primary/30">
            <span className="text-primary-foreground text-sm font-black tracking-tight">L</span>
          </div>
          <span className="font-extrabold text-[17px] text-sidebar-foreground tracking-tight">
            LWD
          </span>
        </div>

        <Link
          href="/invoices/new"
          className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-2.5 mb-5 text-sm font-semibold hover:opacity-90 transition-opacity shadow-md shadow-primary/30"
        >
          <Plus className="w-4 h-4" />
          New Invoice
        </Link>

        <SidebarNav />

        {orgName && (
          <div className="mt-auto pt-3 border-t border-sidebar-border">
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-sidebar-accent">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0 text-[11px] font-bold text-primary-foreground shadow-sm">
                {orgName.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs text-sidebar-foreground/70 font-medium truncate">{orgName}</span>
            </div>
          </div>
        )}
      </aside>

      {/* ── Mobile fixed top header (hidden on desktop) ─────── */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-20 h-14 flex items-center justify-between px-4 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center shadow-sm shadow-primary/30">
            <span className="text-primary-foreground text-xs font-black">L</span>
          </div>
          <span className="font-extrabold text-sm text-sidebar-foreground tracking-tight">
            LWD
          </span>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu
            email={user?.email}
            firstName={user?.user_metadata?.firstName as string | undefined}
          />
        </div>
      </header>

      {/* ── Main area ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 lg:p-5 lg:pl-0">
        {/* Desktop top bar */}
        <header className="hidden lg:flex items-center justify-end gap-3 mb-5 px-1">
          <NotificationBell />
          <UserMenu
            email={user?.email}
            firstName={user?.user_metadata?.firstName as string | undefined}
          />
        </header>

        {/* Content area */}
        <main className="flex-1 lg:bg-card lg:rounded-2xl lg:shadow-sm lg:ring-1 lg:ring-border/40 lg:overflow-auto">
          <div className="pt-16 pb-28 px-4 lg:p-6 lg:pt-6 lg:pb-6">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile bottom navigation ────────────────────────── */}
      <MobileNav orgName={orgName} />
    </div>
  );
}
