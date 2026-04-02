"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";

interface ProfileFormProps {
  email: string;
  firstName: string;
  lastName: string;
}

export function ProfileForm({ email, firstName: initFirst, lastName: initLast }: ProfileFormProps) {
  const supabaseRef = useRef<SupabaseClient | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const [firstName, setFirstName] = useState(initFirst);
  const [lastName, setLastName] = useState(initLast);
  const [loading, setLoading] = useState(false);

  const updateProfile = trpc.team.updateProfile.useMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!firstName.trim()) {
      toast.error("First name is required.");
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.updateUser({
        data: { firstName: firstName.trim(), lastName: lastName.trim() },
      });
      if (error) throw error;

      await updateProfile.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
      });

      toast.success("Profile updated.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} disabled className="bg-muted" />
        <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="firstName">First Name</Label>
        <Input
          id="firstName"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          maxLength={100}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lastName">Last Name</Label>
        <Input
          id="lastName"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          maxLength={100}
        />
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
