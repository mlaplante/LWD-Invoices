"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";

export function OrgSwitcher({ currentOrgId }: { currentOrgId: string }) {
  const router = useRouter();
  const { data: orgs } = trpc.organization.listMyOrgs.useQuery();
  const switchOrg = trpc.organization.switchOrg.useMutation({
    onSuccess: () => router.refresh(),
  });

  const currentOrg = orgs?.find((m) => m.organizationId === currentOrgId);

  return (
    <div className="mt-auto pt-3 border-t border-sidebar-border">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-sidebar-accent w-full hover:bg-sidebar-accent/80 transition-colors text-left">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0 text-[11px] font-bold text-primary-foreground shadow-sm">
              {currentOrg?.organization.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <span className="text-xs text-sidebar-foreground/70 font-medium truncate flex-1">
              {currentOrg?.organization.name ?? "Select org"}
            </span>
            <ChevronsUpDown className="w-3 h-3 text-sidebar-foreground/40 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {orgs?.map((membership) => (
            <DropdownMenuItem
              key={membership.organizationId}
              onClick={() => {
                if (membership.organizationId !== currentOrgId) {
                  switchOrg.mutate({ orgId: membership.organizationId });
                }
              }}
              className="flex items-center gap-2"
            >
              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                {membership.organization.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{membership.organization.name}</p>
                <p className="text-[10px] text-muted-foreground">{membership.role}</p>
              </div>
              {membership.organizationId === currentOrgId && (
                <Check className="w-3.5 h-3.5 text-primary shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/onboarding" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create New Organization
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
