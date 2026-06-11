"use client";

import { trpc } from "@/trpc/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MailX, Copy } from "lucide-react";

/**
 * Email-preferences card on the client detail page. Mirrors the public
 * /unsubscribe/[token] page so an admin can honor a verbal opt-out request,
 * and exposes the public manage-preferences link for resending.
 * Transactional mail (invoice sends, receipts) is unaffected by these toggles.
 */
export function ClientEmailPreferencesPanel({ clientId }: { clientId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.clients.emailPreferences.useQuery({ clientId });

  const setPreference = trpc.clients.setEmailPreference.useMutation({
    onSuccess: () => {
      utils.clients.emailPreferences.invalidate({ clientId });
      toast.success("Email preference saved");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="h-5 w-32 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  const anyDisabled = data.kinds.some((k) => !data.preferences[k.kind]);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MailX className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Email preferences</h2>
          {anyDisabled && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Opted out of some emails
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(data.manageUrl);
            toast.success("Preferences link copied");
          }}
        >
          <Copy className="mr-1 h-3.5 w-3.5" />
          Copy preferences link
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Non-transactional email only — invoices and payment receipts are always delivered.
      </p>
      <div className="space-y-3">
        {data.kinds.map((kind) => (
          <div key={kind.kind} className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{kind.label}</p>
              <p className="text-xs text-muted-foreground">{kind.description}</p>
            </div>
            <Switch
              checked={data.preferences[kind.kind] ?? true}
              onCheckedChange={(enabled) =>
                setPreference.mutate({ clientId, kind: kind.kind, enabled })
              }
              disabled={setPreference.isPending}
              aria-label={kind.label}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
