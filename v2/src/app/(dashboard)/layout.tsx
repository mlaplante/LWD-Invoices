import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import Link from "next/link";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import {
  BarChart2,
  LifeBuoy,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
};

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/invoices", label: "Invoices" },
  { href: "/projects", label: "Projects" },
  { href: "/timesheets", label: "Timesheets" },
  { href: "/items", label: "Items" },
  { href: "/reports", label: "Reports", icon: BarChart2 },
  { href: "/tickets", label: "Tickets", icon: LifeBuoy },
  { href: "/settings", label: "Settings" },
  { href: "/settings/projects", label: "Project Settings" },
  { href: "/settings/audit-log", label: "Activity Log", icon: ClipboardList },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <OrganizationSwitcher />
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild>
                    <Link href={item.href}>
                      {Icon && <Icon className="h-4 w-4" />}
                      {item.label}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <UserButton />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
