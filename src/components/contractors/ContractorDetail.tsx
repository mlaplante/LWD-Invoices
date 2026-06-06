"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Pencil, Trash2, Eye, EyeOff, Plus, Upload, FileText, ExternalLink, AlertTriangle,
} from "lucide-react";
import { TAX_CLASSIFICATIONS } from "./ContractorForm";

const NEC_1099_THRESHOLD = 600;

const METHOD_LABELS: Record<string, string> = {
  CHECK: "Check",
  ACH: "ACH / Bank transfer",
  WIRE: "Wire",
  CASH: "Cash",
  CARD: "Card (1099-K)",
  THIRD_PARTY: "PayPal / Venmo (1099-K)",
  OTHER: "Other",
};

const W9_LABELS: Record<string, string> = {
  RECEIVED: "Received",
  REQUESTED: "Requested",
  NOT_REQUESTED: "Not requested",
};

function classificationLabel(value: string): string {
  return TAX_CLASSIFICATIONS.find((c) => c.value === value)?.label ?? value;
}

export function ContractorDetail({ contractorId }: { contractorId: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: contractor, isLoading } = trpc.contractors.getById.useQuery({ id: contractorId });

  const [revealedTin, setRevealedTin] = useState<string | null>(null);
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);
  const [deleteContractor, setDeleteContractor] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [payment, setPayment] = useState({
    amount: "",
    paidAt: new Date().toISOString().slice(0, 10),
    method: "CHECK",
    reference: "",
    memo: "",
  });

  const revealMutation = trpc.contractors.revealTin.useMutation({
    onSuccess: (res) => setRevealedTin(res.tin),
    onError: (err) => toast.error(err.message),
  });

  const addPaymentMutation = trpc.contractors.addPayment.useMutation({
    onSuccess: () => {
      utils.contractors.getById.invalidate({ id: contractorId });
      utils.contractors.list.invalidate();
      toast.success("Payment recorded");
      setShowAddPayment(false);
      setPayment({ amount: "", paidAt: new Date().toISOString().slice(0, 10), method: "CHECK", reference: "", memo: "" });
    },
    onError: (err) => toast.error(err.message),
  });

  const deletePaymentMutation = trpc.contractors.deletePayment.useMutation({
    onSuccess: () => {
      utils.contractors.getById.invalidate({ id: contractorId });
      utils.contractors.list.invalidate();
      toast.success("Payment removed");
      setDeletePaymentId(null);
    },
    onError: (err) => { toast.error(err.message); setDeletePaymentId(null); },
  });

  const deleteContractorMutation = trpc.contractors.delete.useMutation({
    onSuccess: () => {
      utils.contractors.list.invalidate();
      toast.success("Contractor deleted");
      router.push("/contractors");
    },
    onError: (err) => { toast.error(err.message); setDeleteContractor(false); },
  });

  const setPortalAccessMutation = trpc.contractors.setPortalAccess.useMutation({
    onSuccess: (res) => {
      utils.contractors.getById.invalidate({ id: contractorId });
      toast.success(res.portalEnabled ? "Portal enabled" : "Portal disabled");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!contractor) return <p className="text-sm text-muted-foreground">Contractor not found.</p>;

  const reportableTotal = contractor.payments
    .filter((p) => p.reportable)
    .reduce((s, p) => s + p.amount, 0);
  const eligible = !contractor.exemptFrom1099 && reportableTotal >= NEC_1099_THRESHOLD;
  const portalOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const portalUrl = `${portalOrigin}/contractor/${contractor.portalToken}`;
  const needsW9 = eligible && contractor.w9Status !== "RECEIVED";

  async function handleW9Upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("contractorId", contractorId);
      const res = await fetch("/api/contractors/w9", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      utils.contractors.getById.invalidate({ id: contractorId });
      utils.contractors.list.invalidate();
      toast.success("W-9 uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(payment.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    addPaymentMutation.mutate({
      contractorId,
      amount,
      paidAt: new Date(payment.paidAt),
      method: payment.method as never,
      reference: payment.reference || undefined,
      memo: payment.memo || undefined,
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">{contractor.legalName}</h1>
          {contractor.businessName ? (
            <p className="text-sm text-muted-foreground mt-0.5">{contractor.businessName}</p>
          ) : null}
          <div className="flex items-center gap-2 mt-2">
            {contractor.exemptFrom1099 ? (
              <Badge variant="outline">1099 exempt</Badge>
            ) : eligible ? (
              <Badge variant="default">1099-NEC required</Badge>
            ) : (
              <Badge variant="secondary">Below ${NEC_1099_THRESHOLD} threshold</Badge>
            )}
            {needsW9 ? (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="w-3.5 h-3.5" /> W-9 needed before filing
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button asChild variant="outline" size="sm">
            <Link href={`/contractors/${contractorId}/edit`}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteContractor(true)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* W-9 / identity card */}
        <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4 lg:col-span-1">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">W-9 Details</p>

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Tax classification</dt>
              <dd className="font-medium text-right">
                {contractor.taxClassification ? classificationLabel(contractor.taxClassification) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2 items-center">
              <dt className="text-muted-foreground">TIN</dt>
              <dd className="font-medium text-right tabular-nums flex items-center gap-2">
                {revealedTin
                  ? revealedTin
                  : contractor.tinLast4
                  ? `${contractor.tinType === "EIN" ? "EIN" : "SSN"} ••• ${contractor.tinLast4}`
                  : "—"}
                {contractor.hasTin ? (
                  revealedTin ? (
                    <button type="button" onClick={() => setRevealedTin(null)} title="Hide">
                      <EyeOff className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => revealMutation.mutate({ id: contractorId })}
                      title="Reveal full TIN (admins only)"
                    >
                      <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  )
                ) : null}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">W-9 status</dt>
              <dd className="font-medium text-right">{W9_LABELS[contractor.w9Status] ?? contractor.w9Status}</dd>
            </div>
            {(contractor.addressLine1 || contractor.city) && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Address</dt>
                <dd className="font-medium text-right">
                  {contractor.addressLine1}
                  {contractor.city ? <span className="block">{[contractor.city, contractor.state].filter(Boolean).join(", ")} {contractor.zip}</span> : null}
                </dd>
              </div>
            )}
            {contractor.email && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium text-right">{contractor.email}</dd>
              </div>
            )}
          </dl>

          {/* W-9 document */}
          <div className="pt-2 border-t border-border/50">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={handleW9Upload}
              className="hidden"
              id="w9-upload"
            />
            {contractor.w9DocumentPath ? (
              <div className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <a
                  href={`/api/contractors/w9/download?id=${contractorId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex-1"
                >
                  View W-9 <ExternalLink className="inline w-3 h-3" />
                </a>
                <label htmlFor="w9-upload" className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Replace
                </label>
              </div>
            ) : (
              <label
                htmlFor="w9-upload"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-sm font-medium hover:bg-accent/30 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploading ? "Uploading…" : "Upload signed W-9"}
              </label>
            )}
          </div>
        </div>

        {/* Contractor portal */}
        <div className="rounded-2xl border border-border/50 bg-card p-5 lg:col-span-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Self-Service Portal</p>
              <p className="text-sm mt-1 text-muted-foreground">
                Let this contractor view their payment history, submit a W-9, and download their
                1099-NEC from a private link — no account needed.
              </p>
            </div>
            <Button
              size="sm"
              variant={contractor.portalEnabled ? "outline" : "default"}
              disabled={setPortalAccessMutation.isPending}
              onClick={() =>
                setPortalAccessMutation.mutate({ id: contractorId, enabled: !contractor.portalEnabled })
              }
            >
              {contractor.portalEnabled ? "Disable portal" : "Enable portal"}
            </Button>
          </div>
          {contractor.portalEnabled && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <code className="flex-1 min-w-0 truncate text-xs bg-muted/40 rounded-lg px-3 py-2">
                {portalUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(portalUrl);
                  toast.success("Portal link copied");
                }}
              >
                Copy link
              </Button>
              <a href={portalUrl} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                Open <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {/* Payments */}
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden lg:col-span-2">
          <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Payments</p>
              <p className="text-sm mt-0.5">
                <span className="font-semibold tabular-nums">${reportableTotal.toFixed(2)}</span>
                <span className="text-muted-foreground"> reportable this year</span>
              </p>
            </div>
            <Button size="sm" onClick={() => setShowAddPayment((v) => !v)}>
              <Plus className="w-4 h-4 mr-1.5" /> Record Payment
            </Button>
          </div>

          {showAddPayment && (
            <form onSubmit={submitPayment} className="px-5 py-4 border-b border-border/50 bg-muted/20 space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="text-xs font-medium">Amount</label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={payment.amount}
                    onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))}
                    placeholder="0.00" className="mt-1" required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Date</label>
                  <Input
                    type="date"
                    value={payment.paidAt}
                    onChange={(e) => setPayment((p) => ({ ...p, paidAt: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Method</label>
                  <Select value={payment.method} onValueChange={(v) => setPayment((p) => ({ ...p, method: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(METHOD_LABELS).map(([v, label]) => (
                        <SelectItem key={v} value={v}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium">Reference</label>
                  <Input
                    value={payment.reference}
                    onChange={(e) => setPayment((p) => ({ ...p, reference: e.target.value }))}
                    placeholder="Check #" className="mt-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Memo</label>
                <Input
                  value={payment.memo}
                  onChange={(e) => setPayment((p) => ({ ...p, memo: e.target.value }))}
                  placeholder="Optional" className="mt-1"
                />
              </div>
              {(payment.method === "CARD" || payment.method === "THIRD_PARTY") && (
                <p className="text-xs text-muted-foreground">
                  Card and third-party network payments are reported by the processor on a 1099-K, so this payment
                  won&apos;t count toward the 1099-NEC total.
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={addPaymentMutation.isPending}>
                  {addPaymentMutation.isPending ? "Saving…" : "Save Payment"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowAddPayment(false)}>Cancel</Button>
              </div>
            </form>
          )}

          {contractor.payments.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No payments recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Method</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Memo</th>
                    <th className="px-5 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">1099</th>
                    <th className="px-5 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                    <th className="px-5 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {contractor.payments.map((p) => (
                    <tr key={p.id} className="hover:bg-accent/20 transition-colors">
                      <td className="px-5 py-3">{new Date(p.paidAt).toLocaleDateString()}</td>
                      <td className="px-5 py-3 text-muted-foreground">{METHOD_LABELS[p.method] ?? p.method}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {p.memo || p.reference || "—"}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {p.reportable ? (
                          <Badge variant="secondary">Box 1</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">1099-K</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">${p.amount.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDeletePaymentId(p.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Remove payment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deletePaymentId !== null}
        onOpenChange={(open) => { if (!open) setDeletePaymentId(null); }}
        title="Remove payment"
        description="This cannot be undone."
        onConfirm={() => { if (deletePaymentId) deletePaymentMutation.mutate({ id: deletePaymentId }); }}
        loading={deletePaymentMutation.isPending}
        destructive
      />
      <ConfirmDialog
        open={deleteContractor}
        onOpenChange={(open) => { if (!open) setDeleteContractor(false); }}
        title="Delete contractor"
        description="This removes the contractor and all recorded payments. This cannot be undone."
        onConfirm={() => deleteContractorMutation.mutate({ id: contractorId })}
        loading={deleteContractorMutation.isPending}
        destructive
      />
    </div>
  );
}
