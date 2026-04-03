"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Org = {
  name: string;
  invoicePrefix: string;
  invoiceNextNumber: number;
  taskTimeInterval: number;
  defaultPaymentTermsDays: number;
  paymentReminderDays: number[];
  emailBccOwner: boolean;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
};

const PAYMENT_TERM_OPTIONS = [
  { label: "Due on receipt", days: 0 },
  { label: "Net 7", days: 7 },
  { label: "Net 14", days: 14 },
  { label: "Net 15", days: 15 },
  { label: "Net 30", days: 30 },
  { label: "Net 45", days: 45 },
  { label: "Net 60", days: 60 },
  { label: "Net 90", days: 90 },
];

const REMINDER_DAY_OPTIONS = [1, 2, 3, 5, 7, 14, 30];

export function OrgSettingsForm({ org }: { org: Org }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: org.name,
    invoicePrefix: org.invoicePrefix,
    invoiceNextNumber: org.invoiceNextNumber,
    taskTimeInterval: org.taskTimeInterval,
    defaultPaymentTermsDays: org.defaultPaymentTermsDays,
    paymentReminderDays: org.paymentReminderDays,
    emailBccOwner: org.emailBccOwner,
    addressLine1: org.addressLine1 ?? "",
    addressLine2: org.addressLine2 ?? "",
    city: org.city ?? "",
    state: org.state ?? "",
    postalCode: org.postalCode ?? "",
    country: org.country ?? "",
    phone: org.phone ?? "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = trpc.organization.update.useMutation();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    updateMutation.mutate(
      {
        name: form.name,
        invoicePrefix: form.invoicePrefix,
        invoiceNextNumber: form.invoiceNextNumber,
        taskTimeInterval: form.taskTimeInterval,
        defaultPaymentTermsDays: form.defaultPaymentTermsDays,
        paymentReminderDays: form.paymentReminderDays,
        emailBccOwner: form.emailBccOwner,
        addressLine1: form.addressLine1 || null,
        addressLine2: form.addressLine2 || null,
        city: form.city || null,
        state: form.state || null,
        postalCode: form.postalCode || null,
        country: form.country || null,
        phone: form.phone || null,
      },
      {
        onSuccess: () => {
          setSaved(true);
          startTransition(() => router.refresh());
        },
        onError: (err) => setError(err.message),
      }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          Saved successfully.
        </div>
      )}

      <div>
        <label className="text-sm font-medium">Organization Name</label>
        <Input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          required
          className="mt-1"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Invoice Prefix</label>
          <Input
            value={form.invoicePrefix}
            onChange={(e) => setForm((p) => ({ ...p, invoicePrefix: e.target.value }))}
            placeholder="INV"
            maxLength={10}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Next Invoice Number</label>
          <Input
            type="number"
            min={1}
            value={form.invoiceNextNumber}
            onChange={(e) =>
              setForm((p) => ({ ...p, invoiceNextNumber: parseInt(e.target.value) || 1 }))
            }
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Task Time Interval (minutes)</label>
        <Input
          type="number"
          min={0}
          step={0.5}
          value={form.taskTimeInterval}
          onChange={(e) =>
            setForm((p) => ({ ...p, taskTimeInterval: parseFloat(e.target.value) || 0 }))
          }
          className="mt-1"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Round time entries to this interval. Set to 0 to disable.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium">Default Payment Terms</label>
        <select
          value={form.defaultPaymentTermsDays}
          onChange={(e) => setForm((p) => ({ ...p, defaultPaymentTermsDays: parseInt(e.target.value) }))}
          className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
        >
          {PAYMENT_TERM_OPTIONS.map((o) => (
            <option key={o.days} value={o.days}>{o.label}</option>
          ))}
          {!PAYMENT_TERM_OPTIONS.find((o) => o.days === form.defaultPaymentTermsDays) && (
            <option value={form.defaultPaymentTermsDays}>Net {form.defaultPaymentTermsDays}</option>
          )}
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          New invoices will have their due date set automatically from the invoice date.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium">Send Payment Reminders</label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">
          Send reminder emails this many days before an invoice is due.
        </p>
        <div className="flex flex-wrap gap-2">
          {REMINDER_DAY_OPTIONS.map((d) => (
            <label key={d} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.paymentReminderDays.includes(d)}
                onChange={(e) => {
                  setForm((p) => ({
                    ...p,
                    paymentReminderDays: e.target.checked
                      ? [...p.paymentReminderDays, d].sort((a, b) => a - b)
                      : p.paymentReminderDays.filter((x) => x !== d),
                  }));
                }}
                className="rounded"
              />
              {d === 1 ? "1 day" : `${d} days`}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.emailBccOwner}
            onChange={(e) => setForm((p) => ({ ...p, emailBccOwner: e.target.checked }))}
            className="rounded"
          />
          <span className="font-medium">BCC owner on client emails</span>
        </label>
        <p className="text-xs text-muted-foreground mt-1">
          Send a blind copy of all client-facing emails (invoices, payment receipts, reminders, overdue notices) to the organization owner.
        </p>
      </div>

      {/* ─── Organization Address ──────────────────────────────────────── */}
      <div className="border-t pt-4 mt-4">
        <h3 className="text-sm font-semibold mb-3">Organization Address</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Address Line 1</label>
            <Input
              value={form.addressLine1}
              onChange={(e) => setForm((p) => ({ ...p, addressLine1: e.target.value }))}
              placeholder="123 Main Street"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Address Line 2</label>
            <Input
              value={form.addressLine2}
              onChange={(e) => setForm((p) => ({ ...p, addressLine2: e.target.value }))}
              placeholder="Suite 100"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">City</label>
              <Input
                value={form.city}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">State / Province</label>
              <Input
                value={form.state}
                onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Postal Code</label>
              <Input
                value={form.postalCode}
                onChange={(e) => setForm((p) => ({ ...p, postalCode: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Country</label>
              <Input
                value={form.country}
                onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Phone</label>
            <Input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="(555) 123-4567"
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={updateMutation.isPending}>
        {updateMutation.isPending ? "Saving…" : "Save Changes"}
      </Button>
    </form>
  );
}
