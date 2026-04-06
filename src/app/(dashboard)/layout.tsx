import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { UserMenu } from "@/components/layout/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { MobileNav } from "@/components/layout/MobileNav";
import { OrgSwitcher } from "@/components/layout/OrgSwitcher";
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

async function OrgSwitcherSection() {
  const { data: { user } } = await getUser();
  const orgId = (user?.app_metadata?.organizationId as string) ?? "";
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("activeOrgId")?.value ?? orgId;
  return <OrgSwitcher currentOrgId={activeOrgId} />;
}

async function MobileNavSection() {
  const { data: { user } } = await getUser();
  const orgId = (user?.app_metadata?.organizationId as string) ?? "";
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("activeOrgId")?.value ?? orgId;
  return <MobileNav activeOrgId={activeOrgId} />;
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
        <div className="flex items-center px-2 mb-6">
          <Image src="/logo-horizontal.png" alt="LWD Invoices" width={180} height={40} className="h-9 w-auto" priority />
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
          <OrgSwitcherSection />
        </Suspense>
      </aside>

      {/* ── Mobile fixed top header ────────────────────────── */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-20 h-14 flex items-center justify-between px-4 bg-sidebar border-b border-sidebar-border print:hidden">
        <div className="flex items-center">
          <Image src="/logo-horizontal.png" alt="LWD Invoices" width={150} height={34} className="h-7 w-auto" priority />
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
