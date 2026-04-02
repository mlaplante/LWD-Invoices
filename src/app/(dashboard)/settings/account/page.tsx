import { getUser } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/settings/ProfileForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function AccountSettingsPage() {
  const { data: { user } } = await getUser();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/settings" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight truncate">Account</h1>
      </div>
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Profile</p>
          <p className="text-base font-semibold mt-1">Your Profile</p>
          <p className="text-sm text-muted-foreground mt-0.5">Update your name and profile information.</p>
        </div>
        <div className="px-6 py-6">
          <ProfileForm
            email={user?.email ?? ""}
            firstName={(user?.user_metadata?.firstName as string) ?? ""}
            lastName={(user?.user_metadata?.lastName as string) ?? ""}
          />
        </div>
      </div>
    </div>
  );
}
