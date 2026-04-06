"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAYMENT_TERM_OPTIONS = [
  { label: "Use org default", days: null },
  { label: "Due on receipt", days: 0 },
  { label: "Net 7", days: 7 },
  { label: "Net 14", days: 14 },
  { label: "Net 15", days: 15 },
  { label: "Net 30", days: 30 },
  { label: "Net 45", days: 45 },
  { label: "Net 60", days: 60 },
  { label: "Net 90", days: 90 },
];

type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  taxId: string | null;
  notes: string | null;
  portalPassphraseHash: string | null;
  defaultPaymentTermsDays: number | null;
};

type Props = {
  mode: "create" | "edit";
  client?: Client;
};

export function ClientForm({ mode, client }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [form, setForm] = useState({
    name: client?.name ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    address: client?.address ?? "",
    city: client?.city ?? "",
    state: client?.state ?? "",
    zip: client?.zip ?? "",
    country: client?.country ?? "",
    taxId: client?.taxId ?? "",
    notes: client?.notes ?? "",
    portalPassphrase: "",
    defaultPaymentTermsDays: client?.defaultPaymentTermsDays ?? null,
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = trpc.clients.create.useMutation();
  const updateMutation = trpc.clients.update.useMutation();

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const data = {
      name: form.name,
      email: form.email || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      zip: form.zip || undefined,
      country: form.country || undefined,
      taxId: form.taxId || undefined,
      notes: form.notes || undefined,
      portalPassphrase: form.portalPassphrase || undefined,
      defaultPaymentTermsDays: form.defaultPaymentTermsDays,
    };

    if (mode === "create") {
      createMutation.mutate(data, {
        onSuccess: (newClient) => {
          startTransition(() => router.push(`/clients/${newClient.id}`));
        },
        onError: (err) => setError(err.message),
      });
    } else if (client) {
      updateMutation.mutate(
        { id: client.id, ...data },
        {
          onSuccess: () => {
            startTransition(() => router.refresh());
          },
          onError: (err) => setError(err.message),
        }
      );
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Name *</label>
          <Input
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="Client or company name"
            required
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Email</label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="client@example.com"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Phone</label>
            <Input
              value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              placeholder="+1 555 000 0000"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Address</label>
          <Input
            value={form.address}
            onChange={(e) => handleChange("address", e.target.value)}
            placeholder="Street address"
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">City</label>
            <Input
              value={form.city}
              onChange={(e) => handleChange("city", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">State / Province</label>
            <Input
              value={form.state}
              onChange={(e) => handleChange("state", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Postal Code</label>
            <Input
              value={form.zip}
              onChange={(e) => handleChange("zip", e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Country</label>
            <Input
              value={form.country}
              onChange={(e) => handleChange("country", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Tax ID / VAT</label>
            <Input
              value={form.taxId}
              onChange={(e) => handleChange("taxId", e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Portal Passphrase</label>
          <div className="flex gap-2 mt-1">
            <Input
              type="password"
              value={form.portalPassphrase}
              onChange={(e) => handleChange("portalPassphrase", e.target.value)}
              placeholder={
                mode === "edit" && client?.portalPassphraseHash
                  ? "Leave blank to keep existing passphrase"
                  : "Optional password for client portal"
              }
              autoComplete="new-password"
            />
            {mode === "edit" && client?.portalPassphraseHash && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm("Remove the portal passphrase? The invoice portal will be accessible without a password.")) {
                    updateMutation.mutate(
                      { id: client.id, removePassphrase: true },
                      {
                        onSuccess: () => {
                          startTransition(() => router.refresh());
                        },
                      }
                    );
                  }
                }}
              >
                Remove
              </Button>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Notes</label>
          <Textarea
            value={form.notes}
            onChange={(e) => handleChange("notes", e.target.value)}
            placeholder="Internal notes about this client"
            className="mt-1"
            rows={3}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Default Payment Terms</label>
          <Select
            value={form.defaultPaymentTermsDays === null ? "default" : String(form.defaultPaymentTermsDays)}
            onValueChange={(v) =>
              setForm((p) => ({
                ...p,
                defaultPaymentTermsDays: v === "default" ? null : parseInt(v),
              }))
            }
          >
            <SelectTrigger className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_TERM_OPTIONS.map((o) => (
                <SelectItem key={o.days ?? "default"} value={o.days === null ? "default" : String(o.days)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Overrides the organization default for new invoices with this client.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : mode === "create" ? "Create Client" : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
