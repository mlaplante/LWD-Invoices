"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut, User } from "lucide-react";

interface UserMenuProps {
  email?: string;
  firstName?: string;
}

export function UserMenu({ email, firstName }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const initials = firstName
    ? firstName[0].toUpperCase()
    : email
      ? email[0].toUpperCase()
      : "?";

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        {initials}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-10 z-20 w-52 rounded-xl border border-border bg-card shadow-lg py-1 text-sm">
            {email && (
              <div className="px-3 py-2 border-b border-border/60 mb-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="w-3.5 h-3.5" />
                  <span className="truncate text-xs">{email}</span>
                </div>
              </div>
            )}
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
