"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type KindMeta = { kind: string; label: string; description: string };

type PreferencesPayload = {
  orgName: string;
  kinds: KindMeta[];
  preferences: Record<string, boolean>;
};

export function EmailPreferencesForm({ token }: { token: string }) {
  const [data, setData] = useState<PreferencesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/email-preferences/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Invalid link");
        return res.json() as Promise<PreferencesPayload>;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setError("This link is invalid or has been rotated.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const save = useCallback(
    async (preferences: Record<string, boolean>) => {
      setSaving(true);
      setSaved(false);
      try {
        const res = await fetch(`/api/email-preferences/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferences }),
        });
        if (!res.ok) throw new Error("save failed");
        setSaved(true);
      } catch {
        setError("Could not save your preferences. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [token],
  );

  if (error) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Email preferences</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Email preferences</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const toggle = (kind: string, enabled: boolean) => {
    const next = { ...data.preferences, [kind]: enabled };
    setData({ ...data, preferences: next });
    void save({ [kind]: enabled });
  };

  const unsubscribeAll = () => {
    const next = Object.fromEntries(data.kinds.map((k) => [k.kind, false]));
    setData({ ...data, preferences: next });
    void save(next);
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Email preferences</CardTitle>
        <CardDescription>
          Choose which emails you receive from {data.orgName || "this business"}. Invoices and
          payment receipts are always delivered.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {data.kinds.map((kind) => (
          <div key={kind.kind} className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor={`pref-${kind.kind}`}>{kind.label}</Label>
              <p className="text-sm text-muted-foreground">{kind.description}</p>
            </div>
            <Switch
              id={`pref-${kind.kind}`}
              checked={data.preferences[kind.kind] ?? true}
              onCheckedChange={(checked) => toggle(kind.kind, checked)}
              disabled={saving}
            />
          </div>
        ))}
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {saved ? "Preferences saved." : " "}
          </p>
          <Button variant="outline" onClick={unsubscribeAll} disabled={saving}>
            Unsubscribe from all
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
