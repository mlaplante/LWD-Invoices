import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "@/components/layout/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SidebarNav } from "@/components/layout/SidebarNav";
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

        {/* Org name at bottom */}
        {orgName && (
          <div className="mt-auto pt-3 border-t border-border/60">
            <div className="px-3 py-2 text-xs text-muted-foreground font-medium truncate">
              {orgName}
            </div>
          </div>
        )}
      </aside>

      {/* ── Main area ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 p-5 pl-0">
        {/* Top bar */}
        <header className="flex items-center justify-end gap-3 mb-5 px-1">
          <NotificationBell />
          <UserMenu
            email={user?.email}
            firstName={user?.user_metadata?.firstName as string | undefined}
          />
        </header>

        {/* White content card */}
        <main className="flex-1 bg-card rounded-2xl shadow-sm ring-1 ring-border/40 overflow-auto">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
