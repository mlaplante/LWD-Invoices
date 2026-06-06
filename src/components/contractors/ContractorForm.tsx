"use client";

import { useState } from "react";
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
import { toast } from "sonner";

export const TAX_CLASSIFICATIONS: { value: string; label: string }[] = [
  { value: "individual", label: "Individual / Sole proprietor" },
  { value: "c_corp", label: "C Corporation" },
  { value: "s_corp", label: "S Corporation" },
  { value: "partnership", label: "Partnership" },
  { value: "trust_estate", label: "Trust / Estate" },
  { value: "llc", label: "LLC" },
  { value: "other", label: "Other" },
];

type Defaults = {
  legalName?: string;
  businessName?: string;
  taxClassification?: string;
  tinType?: string;
  tinLast4?: string | null;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  w9Status?: string;
  exemptFrom1099?: boolean;
  notes?: string;
};

type Props =
  | { mode: "create"; contractorId?: never; defaults?: Defaults }
  | { mode: "edit"; contractorId: string; defaults?: Defaults };

export function ContractorForm({ mode, contractorId, defaults = {} }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [form, setForm] = useState({
    legalName: defaults.legalName ?? "",
    businessName: defaults.businessName ?? "",
    taxClassification: defaults.taxClassification ?? "",
    tinType: defaults.tinType ?? "",
    tin: "",
    email: defaults.email ?? "",
    phone: defaults.phone ?? "",
    addressLine1: defaults.addressLine1 ?? "",
    addressLine2: defaults.addressLine2 ?? "",
    city: defaults.city ?? "",
    state: defaults.state ?? "",
    zip: defaults.zip ?? "",
    country: defaults.country ?? "US",
    w9Status: defaults.w9Status ?? "NOT_REQUESTED",
    exemptFrom1099: defaults.exemptFrom1099 ?? false,
    notes: defaults.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  const onSuccess = () => {
    utils.contractors.list.invalidate();
    if (mode === "edit" && contractorId) utils.contractors.getById.invalidate({ id: contractorId });
    toast.success(mode === "create" ? "Contractor added" : "Contractor updated");
    router.push(mode === "edit" && contractorId ? `/contractors/${contractorId}` : "/contractors");
  };

  const createMutation = trpc.contractors.create.useMutation({
    onSuccess,
    onError: (err) => setError(err.message),
  });
  const updateMutation = trpc.contractors.update.useMutation({
    onSuccess,
    onError: (err) => setError(err.message),
  });
  const isPending = createMutation.isPending || updateMutation.isPending;

  const isCorp = form.taxClassification === "c_corp" || form.taxClassification === "s_corp";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.legalName.trim()) {
      setError("Legal name is required.");
      return;
    }

    const shared = {
      legalName: form.legalName.trim(),
      businessName: form.businessName || undefined,
      taxClassification: (form.taxClassification || undefined) as never,
      tinType: (form.tinType || undefined) as never,
      email: form.email || undefined,
      phone: form.phone || undefined,
      addressLine1: form.addressLine1 || undefined,
      addressLine2: form.addressLine2 || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      zip: form.zip || undefined,
      country: form.country || undefined,
      w9Status: form.w9Status as never,
      exemptFrom1099: form.exemptFrom1099,
      notes: form.notes || undefined,
    };

    if (mode === "create") {
      createMutation.mutate({ ...shared, tin: form.tin || undefined });
    } else {
      // Only send the TIN when the user actually typed one, so an edit doesn't
      // wipe the stored value.
      updateMutation.mutate({
        id: contractorId,
        ...shared,
        ...(form.tin ? { tin: form.tin } : {}),
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {/* Identity */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">
            Legal Name <span className="text-destructive">*</span>
          </label>
          <Input
            value={form.legalName}
            onChange={(e) => setForm((p) => ({ ...p, legalName: e.target.value }))}
            placeholder="Name as shown on tax return"
            required
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">
            Business Name <span className="text-muted-foreground font-normal">(if different)</span>
          </label>
          <Input
            value={form.businessName}
            onChange={(e) => setForm((p) => ({ ...p, businessName: e.target.value }))}
            placeholder="DBA / entity name"
            className="mt-1"
          />
        </div>
      </div>

      {/* Tax classification + TIN */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium">Federal Tax Classification</label>
          <Select
            value={form.taxClassification || "none"}
            onValueChange={(v) => setForm((p) => ({ ...p, taxClassification: v === "none" ? "" : v }))}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unspecified</SelectItem>
              {TAX_CLASSIFICATIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">TIN Type</label>
          <Select
            value={form.tinType || "none"}
            onValueChange={(v) => setForm((p) => ({ ...p, tinType: v === "none" ? "" : v }))}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unspecified</SelectItem>
              <SelectItem value="SSN">SSN</SelectItem>
              <SelectItem value="EIN">EIN</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">
            TIN (SSN / EIN)
            {defaults.tinLast4 ? (
              <span className="text-muted-foreground font-normal"> · on file ••• {defaults.tinLast4}</span>
            ) : null}
          </label>
          <Input
            value={form.tin}
            onChange={(e) => setForm((p) => ({ ...p, tin: e.target.value }))}
            placeholder={mode === "edit" && defaults.tinLast4 ? "Leave blank to keep" : "123-45-6789"}
            className="mt-1"
            autoComplete="off"
          />
        </div>
      </div>

      {isCorp && (
        <p className="text-xs text-amber-600">
          Corporations are generally exempt from 1099-NEC reporting. Consider marking this contractor exempt below.
        </p>
      )}

      {/* Contact */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Email</label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="Optional"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Phone</label>
          <Input
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            placeholder="Optional"
            className="mt-1"
          />
        </div>
      </div>

      {/* Address */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Address Line 1</label>
            <Input
              value={form.addressLine1}
              onChange={(e) => setForm((p) => ({ ...p, addressLine1: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Address Line 2</label>
            <Input
              value={form.addressLine2}
              onChange={(e) => setForm((p) => ({ ...p, addressLine2: e.target.value }))}
              className="mt-1"
            />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-2">
            <label className="text-sm font-medium">City</label>
            <Input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">State</label>
            <Input value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">ZIP</label>
            <Input value={form.zip} onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))} className="mt-1" />
          </div>
        </div>
      </div>

      {/* W-9 status + exempt */}
      <div className="grid grid-cols-2 gap-4 items-end">
        <div>
          <label className="text-sm font-medium">W-9 Status</label>
          <Select
            value={form.w9Status}
            onValueChange={(v) => setForm((p) => ({ ...p, w9Status: v }))}
          >
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NOT_REQUESTED">Not requested</SelectItem>
              <SelectItem value="REQUESTED">Requested</SelectItem>
              <SelectItem value="RECEIVED">Received</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            id="exempt"
            checked={form.exemptFrom1099}
            onChange={(e) => setForm((p) => ({ ...p, exemptFrom1099: e.target.checked }))}
            className="h-4 w-4 rounded border-border"
          />
          <label htmlFor="exempt" className="text-sm font-medium cursor-pointer">
            Exempt from 1099 (e.g. corporation)
          </label>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-sm font-medium">Notes</label>
        <Textarea
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Optional"
          rows={2}
          className="mt-1"
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : mode === "create" ? "Add Contractor" : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(mode === "edit" && contractorId ? `/contractors/${contractorId}` : "/contractors")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
