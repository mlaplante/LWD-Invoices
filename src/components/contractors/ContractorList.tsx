"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, AlertTriangle } from "lucide-react";

const W9_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  RECEIVED: { label: "W-9 on file", variant: "default" },
  REQUESTED: { label: "W-9 requested", variant: "secondary" },
  NOT_REQUESTED: { label: "No W-9", variant: "outline" },
};

const NEC_1099_THRESHOLD = 600;

export function ContractorList() {
  const { data } = trpc.contractors.list.useQuery({ includeArchived: false });
  const contractors = data?.contractors ?? [];
  const year = data?.year ?? new Date().getFullYear();

  const ytdTotal = contractors.reduce((s, c) => s + c.ytdReportable, 0);
  const eligibleCount = contractors.filter(
    (c) => !c.exemptFrom1099 && c.ytdReportable >= NEC_1099_THRESHOLD,
  ).length;
  const missingW9Count = contractors.filter(
    (c) => !c.exemptFrom1099 && c.ytdReportable >= NEC_1099_THRESHOLD && c.w9Status !== "RECEIVED",
  ).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contractors</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track 1099 contractor payments, collect W-9s, and file at year end.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/reports/1099">
              <FileText className="w-4 h-4 mr-1.5" />
              1099 Pack
            </Link>
          </Button>
          <Button asChild>
            <Link href="/contractors/new">
              <Plus className="w-4 h-4 mr-1.5" />
              New Contractor
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      {contractors.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">Contractors</p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums">{contractors.length}</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">{year} Reportable</p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums">${ytdTotal.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">Need a 1099-NEC</p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums">{eligibleCount}</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">Missing W-9</p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums text-amber-600">{missingW9Count}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            All Contractors
          </p>
        </div>

        {contractors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <p className="text-sm text-muted-foreground">No contractors yet.</p>
            <Button asChild size="sm">
              <Link href="/contractors/new">
                <Plus className="w-4 h-4 mr-1.5" />
                Add your first contractor
              </Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">TIN</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">W-9</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">{year} Reportable</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">1099-NEC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {contractors.map((c) => {
                  const w9 = W9_BADGE[c.w9Status] ?? W9_BADGE.NOT_REQUESTED;
                  const eligible = !c.exemptFrom1099 && c.ytdReportable >= NEC_1099_THRESHOLD;
                  const needsW9 = eligible && c.w9Status !== "RECEIVED";
                  return (
                    <tr key={c.id} className="hover:bg-accent/20 transition-colors">
                      <td className="px-6 py-3.5 font-medium">
                        <Link href={`/contractors/${c.id}`} className="hover:text-primary transition-colors">
                          {c.legalName}
                        </Link>
                        {c.businessName ? (
                          <span className="block text-xs text-muted-foreground">{c.businessName}</span>
                        ) : null}
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground tabular-nums">
                        {c.tinLast4 ? `••• ${c.tinLast4}` : "—"}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant={w9.variant}>{w9.label}</Badge>
                          {needsW9 ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" aria-label="W-9 needed for filing" />
                          ) : null}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right font-semibold tabular-nums">
                        ${c.ytdReportable.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {c.exemptFrom1099 ? (
                          <Badge variant="outline">Exempt</Badge>
                        ) : eligible ? (
                          <Badge variant="default">Required</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Below threshold</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
