"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
  portalPassphrase: string | null;
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
    portalPassphrase: client?.portalPassphrase ?? "",
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

        <div className="grid grid-cols-2 gap-4">
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

        <div className="grid grid-cols-3 gap-4">
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

        <div className="grid grid-cols-2 gap-4">
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
          <Input
            value={form.portalPassphrase}
            onChange={(e) => handleChange("portalPassphrase", e.target.value)}
            placeholder="Optional password for client portal"
            className="mt-1"
          />
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
