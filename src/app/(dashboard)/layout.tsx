import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { UserMenu } from "@/components/layout/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { MobileNav } from "@/components/layout/MobileNav";
import { Plus } from "lucide-react";
import { CommandPalette, SearchTriggerButton } from "@/components/layout/CommandPalette";
import { Skeleton } from "@/components/ui/skeleton";

/* ── Dynamic fragments wrapped in Suspense for PPR ── */

async function UserMenuSection() {
  const { data: { user } } = await getUser();
  return (
    <UserMenu
      email={user?.email}
      firstName={user?.user_metadata?.firstName as string | undefined}
    />
  );
}

async function OrgBadge() {
  const { data: { user } } = await getUser();
  const orgName = (user?.app_metadata?.orgName as string) ?? null;
  if (!orgName) return null;
  return (
    <div className="mt-auto pt-3 border-t border-sidebar-border">
      <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-sidebar-accent">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0 text-[11px] font-bold text-primary-foreground shadow-sm">
          {orgName.charAt(0).toUpperCase()}
        </div>
        <span className="text-xs text-sidebar-foreground/70 font-medium truncate">{orgName}</span>
      </div>
    </div>
  );
}

async function MobileNavSection() {
  const { data: { user } } = await getUser();
  const orgName = (user?.app_metadata?.orgName as string) ?? null;
  return <MobileNav orgName={orgName} />;
}

const UserMenuFallback = () => <Skeleton className="h-8 w-8 rounded-full" />;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: { user } } = await getUser();
  if (user) {
    try {
      const dbUser = await db.user.findFirst({
        where: { supabaseId: user.id },
        select: { isActive: true },
      });
      if (dbUser && !dbUser.isActive) {
        redirect("/suspended");
      }
    } catch {
      // isActive column may not exist yet if migration hasn't run
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Desktop sidebar (static shell, pre-rendered) ──── */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col p-4 gap-0 bg-sidebar print:hidden">
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

        <Suspense>
          <SidebarNav />
        </Suspense>

        <Suspense>
          <OrgBadge />
        </Suspense>
      </aside>

      {/* ── Mobile fixed top header ────────────────────────── */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-20 h-14 flex items-center justify-between px-4 bg-sidebar border-b border-sidebar-border print:hidden">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center shadow-sm shadow-primary/30">
            <span className="text-primary-foreground text-xs font-black">L</span>
          </div>
          <span className="font-extrabold text-sm text-sidebar-foreground tracking-tight">
            LWD
          </span>
        </div>
        <div className="flex items-center gap-3">
          <SearchTriggerButton />
          <NotificationBell />
          <Suspense fallback={<UserMenuFallback />}>
            <UserMenuSection />
          </Suspense>
        </div>
      </header>

      {/* ── Main area ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 lg:p-5 lg:pl-0">
        {/* Desktop top bar */}
        <header className="hidden lg:flex items-center justify-end gap-3 mb-5 px-1 print:hidden">
          <SearchTriggerButton />
          <NotificationBell />
          <Suspense fallback={<UserMenuFallback />}>
            <UserMenuSection />
          </Suspense>
        </header>

        {/* Content area */}
        <main className="flex-1 lg:bg-card lg:rounded-2xl lg:shadow-sm lg:ring-1 lg:ring-border/40 lg:overflow-auto">
          <div className="pt-16 pb-28 px-4 lg:p-6 lg:pt-6 lg:pb-6">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile bottom navigation ───────────────────────── */}
      <div className="print:hidden">
        <Suspense>
          <MobileNavSection />
        </Suspense>
      </div>

      <Suspense>
        <CommandPalette />
      </Suspense>
    </div>
  );
}
