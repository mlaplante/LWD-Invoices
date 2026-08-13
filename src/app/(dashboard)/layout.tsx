import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { findDbUserBySupabaseId } from "@/server/user-context";
import { UserMenu } from "@/components/layout/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { MobileNav } from "@/components/layout/MobileNav";
import { OrgSwitcher } from "@/components/layout/OrgSwitcher";
import { Plus } from "lucide-react";
import { CommandPalette, SearchTriggerButton } from "@/components/layout/CommandPalette";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

const UserMenuFallback = () => <Skeleton className="size-7 rounded-full" />;

/**
 * Brand lockup. The indigo monogram tile is the design's stand-in for the
 * mark — `public/logo.png` is a marketing render with baked-in texture and
 * heavy padding, so it doesn't sit on a 32px tile. Swap it in here once a
 * transparent, tightly-cropped asset exists.
 */
function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground",
          compact ? "size-[30px] text-[11px]" : "size-8 text-xs",
        )}
      >
        ML
      </span>
      <span className="text-[13px] font-semibold leading-tight text-foreground">
        LWD Invoices
      </span>
    </Link>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: { user } } = await getUser();
  if (user) {
    try {
      const dbUser = await findDbUserBySupabaseId(user.id);
      if (dbUser && !dbUser.isActive) {
        redirect("/suspended");
      }
    } catch {
      // isActive column may not exist yet if migration hasn't run
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-[6px] focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* ── Desktop rail — 204px, paper-white ─────────────── */}
      <aside className="hidden w-[204px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar pb-4 pt-[18px] print:hidden lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="px-5 pb-4">
          <BrandMark />
        </div>

        <div className="px-5 pb-[18px]">
          <Link
            href="/invoices/new"
            className="flex w-full items-center justify-center gap-1.5 rounded-[6px] bg-primary py-2.5 text-[11px] font-semibold uppercase tracking-[2px] text-primary-foreground shadow-[0_4px_15px_rgba(63,81,181,0.4)] transition-all duration-200 ease-[ease] hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(63,81,181,0.5)]"
          >
            <Plus className="size-3.5" />
            New Invoice
          </Link>
        </div>

        <div className="min-h-0 flex-1 px-3">
          <Suspense>
            <SidebarNav />
          </Suspense>
        </div>

        <div className="mt-auto border-t border-sidebar-border px-5 pt-3.5">
          <Suspense>
            <OrgSwitcherSection />
          </Suspense>
        </div>
      </aside>

      {/* ── Mobile top header ─────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card px-5 print:hidden lg:hidden">
        <BrandMark compact />
        <div className="flex items-center gap-3.5">
          <SearchTriggerButton />
          <ThemeToggle />
          <NotificationBell />
          <Suspense fallback={<UserMenuFallback />}>
            <UserMenuSection />
          </Suspense>
        </div>
      </header>

      {/* ── Main area — content sits directly on paper ────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden items-center justify-end gap-3 px-10 pt-6 print:hidden lg:flex">
          <SearchTriggerButton />
          <ThemeToggle />
          <NotificationBell />
          <Suspense fallback={<UserMenuFallback />}>
            <UserMenuSection />
          </Suspense>
        </header>

        <main id="main" className="flex-1">
          <div className="px-5 pb-28 pt-[78px] lg:px-10 lg:pb-10 lg:pt-6">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile tab bar + FAB ──────────────────────────── */}
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
