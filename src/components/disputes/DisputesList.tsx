"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { AlertTriangle, Clock, ShieldX } from "lucide-react";
import type { DisputeStatus } from "@/generated/prisma";

const STATUS_BADGE: Record<DisputeStatus, { label: string; className: string }> = {
  NEEDS_RESPONSE: { label: "Needs response", className: "bg-red-50 text-red-600" },
  UNDER_REVIEW: { label: "Under review", className: "bg-amber-50 text-amber-600" },
  WON: { label: "Won", className: "bg-emerald-50 text-emerald-600" },
  LOST: { label: "Lost", className: "bg-gray-100 text-gray-500" },
  WARNING_CLOSED: { label: "Warning closed", className: "bg-gray-100 text-gray-500" },
  CHARGE_REFUNDED: { label: "Refunded", className: "bg-blue-50 text-blue-600" },
  CLOSED: { label: "Closed", className: "bg-gray-100 text-gray-500" },
};

type DisputeRow = {
  id: string;
  amount: unknown;
  currency: string;
  reason: string | null;
  status: DisputeStatus;
  evidenceDueBy: Date | null;
  evidenceSubmittedAt: Date | null;
  invoice: { id: string; number: string } | null;
  client: { id: string; name: string } | null;
};

function money(currency: string, amount: unknown): string {
  return `${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`;
}

export function DisputesList() {
  const { data, isLoading } = trpc.disputes.list.useQuery({ status: "all" });
  const [active, setActive] = useState<string | null>(null);
  // Capture "now" once on mount so the deadline-urgency check stays pure across
  // re-renders (rather than calling Date.now() during render).
  const [nowMs] = useState(() => Date.now());

  if (isLoading) {
    return <div className="h-32 rounded-2xl border border-border/50 bg-card animate-pulse" />;
  }

  const disputes = (data?.disputes ?? []) as DisputeRow[];

  if (disputes.length === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-10 text-center">
        <ShieldX className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm font-medium">No disputes</p>
        <p className="text-sm text-muted-foreground mt-1">
          Chargebacks raised against your Stripe payments will appear here, with the evidence
          deadline and a one-click response.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-semibold">Client</th>
              <th className="px-5 py-3 font-semibold">Invoice</th>
              <th className="px-5 py-3 font-semibold">Amount</th>
              <th className="px-5 py-3 font-semibold">Reason</th>
              <th className="px-5 py-3 font-semibold">Respond by</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {disputes.map((d) => {
              const badge = STATUS_BADGE[d.status];
              const urgent =
                d.status === "NEEDS_RESPONSE" &&
                d.evidenceDueBy != null &&
                new Date(d.evidenceDueBy).getTime() - nowMs < 3 * 86400000;
              return (
                <tr
                  key={d.id}
                  onClick={() => setActive(d.id)}
                  className="border-b border-border/30 last:border-0 hover:bg-accent/30 cursor-pointer"
                >
                  <td className="px-5 py-3 font-medium">{d.client?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {d.invoice ? `#${d.invoice.number}` : "—"}
                  </td>
                  <td className="px-5 py-3">{money(d.currency, d.amount)}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {d.reason?.replace(/_/g, " ") ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    {d.evidenceDueBy ? (
                      <span className={cn("inline-flex items-center gap-1", urgent && "text-red-600 font-medium")}>
                        {urgent && <AlertTriangle className="w-3.5 h-3.5" />}
                        {formatDate(d.evidenceDueBy)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", badge.className)}>
                      {badge.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {active && <DisputeDialog disputeId={active} onClose={() => setActive(null)} />}
    </>
  );
}

function DisputeDialog({ disputeId, onClose }: { disputeId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: dispute, isLoading } = trpc.disputes.get.useQuery({ id: disputeId });

  const [productDescription, setProductDescription] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmailAddress, setCustomerEmailAddress] = useState("");
  const [uncategorizedText, setUncategorizedText] = useState("");

  const submit = trpc.disputes.submitEvidence.useMutation({
    onSuccess: () => {
      utils.disputes.list.invalidate();
      utils.disputes.get.invalidate({ id: disputeId });
      toast.success("Evidence submitted to Stripe");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const accept = trpc.disputes.accept.useMutation({
    onSuccess: () => {
      utils.disputes.list.invalidate();
      toast.success("Dispute conceded");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const open = dispute?.status === "NEEDS_RESPONSE" || dispute?.status === "UNDER_REVIEW";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {dispute?.client?.name ? `Dispute — ${dispute.client.name}` : "Dispute"}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !dispute ? (
          <div className="h-40 animate-pulse bg-muted rounded-lg" />
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/40 px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">{money(dispute.currency, dispute.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reason</span>
                <span>{dispute.reason?.replace(/_/g, " ") ?? "—"}</span>
              </div>
              {dispute.invoice && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice</span>
                  <span>#{dispute.invoice.number}</span>
                </div>
              )}
              {dispute.evidenceDueBy && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Respond by</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDate(dispute.evidenceDueBy)}
                  </span>
                </div>
              )}
            </div>

            {open ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Submit text evidence to contest the chargeback. Provide what proves the product or
                  service was delivered.
                </p>
                <Field label="Product / service description">
                  <Textarea
                    rows={3}
                    value={productDescription}
                    onChange={(e) => setProductDescription(e.target.value)}
                    placeholder="What was sold and delivered"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Customer name">
                    <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                  </Field>
                  <Field label="Customer email">
                    <Input
                      value={customerEmailAddress}
                      onChange={(e) => setCustomerEmailAddress(e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Service date">
                  <Input
                    value={serviceDate}
                    onChange={(e) => setServiceDate(e.target.value)}
                    placeholder="e.g. 2026-05-01"
                  />
                </Field>
                <Field label="Additional notes for the bank">
                  <Textarea
                    rows={3}
                    value={uncategorizedText}
                    onChange={(e) => setUncategorizedText(e.target.value)}
                  />
                </Field>

                <DialogFooter className="gap-2 sm:gap-2">
                  <Button
                    variant="ghost"
                    className="text-muted-foreground"
                    disabled={accept.isPending}
                    onClick={() => accept.mutate({ id: disputeId })}
                  >
                    Concede dispute
                  </Button>
                  <Button
                    disabled={submit.isPending}
                    onClick={() =>
                      submit.mutate({
                        id: disputeId,
                        submit: true,
                        evidence: {
                          productDescription: productDescription || undefined,
                          serviceDate: serviceDate || undefined,
                          customerName: customerName || undefined,
                          customerEmailAddress: customerEmailAddress || undefined,
                          uncategorizedText: uncategorizedText || undefined,
                        },
                      })
                    }
                  >
                    Submit evidence
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This dispute is {dispute.status.replace(/_/g, " ").toLowerCase()} and no longer
                accepts evidence.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
