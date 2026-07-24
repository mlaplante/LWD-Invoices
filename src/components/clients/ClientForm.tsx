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
  ccEmails: string[];
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  taxId: string | null;
  notes: string | null;
  tags: string[];
  hasPortalPassphrase: boolean;
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
    ccEmails: (client?.ccEmails ?? []).join(", "),
    phone: client?.phone ?? "",
    address: client?.address ?? "",
    city: client?.city ?? "",
    state: client?.state ?? "",
    zip: client?.zip ?? "",
    country: client?.country ?? "",
    taxId: client?.taxId ?? "",
    notes: client?.notes ?? "",
    tags: (client?.tags ?? []).join(", "),
    portalPassphrase: "",
    defaultPaymentTermsDays: client?.defaultPaymentTermsDays ?? null,
  });
  const [error, setError] = useState<string | null>(null);

  // Parse the comma/whitespace-separated CC input into a clean array. Same
  // shape the server expects (each entry must be a valid email).
  function parseCcEmails(raw: string): string[] {
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  const ccList = parseCcEmails(form.ccEmails);
  const ccInvalid = ccList.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const ccTooMany = ccList.length > 10;

  const createMutation = trpc.clients.create.useMutation();
  const updateMutation = trpc.clients.update.useMutation();

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (ccInvalid.length > 0) {
      setError(
        `Invalid CC email${ccInvalid.length > 1 ? "s" : ""}: ${ccInvalid.join(", ")}`,
      );
      return;
    }
    if (ccTooMany) {
      setError("CC list is limited to 10 addresses.");
      return;
    }

    const data = {
      name: form.name,
      email: form.email || undefined,
      ccEmails: ccList,
      phone: form.phone || undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      zip: form.zip || undefined,
      country: form.country || undefined,
      taxId: form.taxId || undefined,
      notes: form.notes || undefined,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
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
        },
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
          <label htmlFor="client-name" className="text-sm font-medium">
            Name *
          </label>
          <Input
            id="client-name"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="Client or company name"
            required
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="client-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="client-email"
              type="email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="client@example.com"
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="client-phone" className="text-sm font-medium">
              Phone
            </label>
            <Input
              id="client-phone"
              value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              placeholder="+1 555 000 0000"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <label htmlFor="client-cc-emails" className="text-sm font-medium">
            CC Emails
          </label>
          <Input
            id="client-cc-emails"
            value={form.ccEmails}
            onChange={(e) => handleChange("ccEmails", e.target.value)}
            placeholder="accountant@example.com, ap@example.com"
            className="mt-1"
            aria-invalid={ccInvalid.length > 0 || ccTooMany}
            aria-describedby={
              [
                ccInvalid.length > 0 ? "client-cc-emails-invalid" : undefined,
                ccTooMany ? "client-cc-emails-limit" : undefined,
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
          />
          <p className="text-xs text-muted-foreground mt-1">
            Comma-separated. Copied on invoice and receipt emails to this
            client. Up to 10 addresses.
          </p>
          {ccInvalid.length > 0 && (
            <p
              id="client-cc-emails-invalid"
              className="text-xs text-destructive mt-1"
            >
              Invalid: {ccInvalid.join(", ")}
            </p>
          )}
          {ccTooMany && (
            <p
              id="client-cc-emails-limit"
              className="text-xs text-destructive mt-1"
            >
              Limit is 10 addresses.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="client-address" className="text-sm font-medium">
            Address
          </label>
          <Input
            id="client-address"
            value={form.address}
            onChange={(e) => handleChange("address", e.target.value)}
            placeholder="Street address"
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="client-city" className="text-sm font-medium">
              City
            </label>
            <Input
              id="client-city"
              value={form.city}
              onChange={(e) => handleChange("city", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="client-state" className="text-sm font-medium">
              State / Province
            </label>
            <Input
              id="client-state"
              value={form.state}
              onChange={(e) => handleChange("state", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="client-postal-code" className="text-sm font-medium">
              Postal Code
            </label>
            <Input
              id="client-postal-code"
              value={form.zip}
              onChange={(e) => handleChange("zip", e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="client-country" className="text-sm font-medium">
              Country
            </label>
            <Input
              id="client-country"
              value={form.country}
              onChange={(e) => handleChange("country", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="client-tax-id" className="text-sm font-medium">
              Tax ID / VAT
            </label>
            <Input
              id="client-tax-id"
              value={form.taxId}
              onChange={(e) => handleChange("taxId", e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="client-portal-passphrase"
            className="text-sm font-medium"
          >
            Portal Passphrase
          </label>
          <div className="flex gap-2 mt-1">
            <Input
              id="client-portal-passphrase"
              type="password"
              value={form.portalPassphrase}
              onChange={(e) => handleChange("portalPassphrase", e.target.value)}
              placeholder={
                mode === "edit" && client?.hasPortalPassphrase
                  ? "Leave blank to keep existing passphrase"
                  : "Optional password for client portal"
              }
              autoComplete="new-password"
            />
            {mode === "edit" && client?.hasPortalPassphrase && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 text-destructive hover:text-destructive"
                onClick={() => {
                  if (
                    confirm(
                      "Remove the portal passphrase? The invoice portal will be accessible without a password.",
                    )
                  ) {
                    updateMutation.mutate(
                      { id: client.id, removePassphrase: true },
                      {
                        onSuccess: () => {
                          startTransition(() => router.refresh());
                        },
                      },
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
          <label htmlFor="client-tags" className="text-sm font-medium">
            Tags
          </label>
          <Input
            id="client-tags"
            value={form.tags}
            onChange={(e) => handleChange("tags", e.target.value)}
            placeholder="retainer, net-60, agency"
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Comma-separated labels for filtering the client list. Up to 20 tags.
          </p>
        </div>

        <div>
          <label htmlFor="client-notes" className="text-sm font-medium">
            Notes
          </label>
          <Textarea
            id="client-notes"
            value={form.notes}
            onChange={(e) => handleChange("notes", e.target.value)}
            placeholder="Internal notes about this client"
            className="mt-1"
            rows={3}
          />
        </div>

        <div>
          <label
            htmlFor="client-default-payment-terms"
            className="text-sm font-medium"
          >
            Default Payment Terms
          </label>
          <Select
            value={
              form.defaultPaymentTermsDays === null
                ? "default"
                : String(form.defaultPaymentTermsDays)
            }
            onValueChange={(v) =>
              setForm((p) => ({
                ...p,
                defaultPaymentTermsDays: v === "default" ? null : parseInt(v),
              }))
            }
          >
            <SelectTrigger
              id="client-default-payment-terms"
              className="mt-1 w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_TERM_OPTIONS.map((o) => (
                <SelectItem
                  key={o.days ?? "default"}
                  value={o.days === null ? "default" : String(o.days)}
                >
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Overrides the organization default for new invoices with this
            client.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Saving…"
            : mode === "create"
              ? "Create Client"
              : "Save Changes"}
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
