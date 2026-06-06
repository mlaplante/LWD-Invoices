"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileArchive, FileText, AlertTriangle } from "lucide-react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
const NEC_1099_THRESHOLD = 600;

export default function Form1099Page() {
  const [year, setYear] = useState(String(currentYear));
  const yearNum = parseInt(year, 10);

  const { data } = trpc.contractors.list.useQuery({ includeArchived: false, year: yearNum });
  const contractors = (data?.contractors ?? []).filter((c) => c.ytdReportable > 0);

  const eligible = contractors.filter(
    (c) => !c.exemptFrom1099 && c.ytdReportable >= NEC_1099_THRESHOLD,
  );
  const missingW9 = eligible.filter((c) => c.w9Status !== "RECEIVED");
  const eligibleTotal = eligible.reduce((s, c) => s + c.ytdReportable, 0);

  const base = `/api/reports/1099?year=${year}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Reports
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">1099 / Contractor Tax Pack</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate 1099-NEC forms and a filing summary for contractors paid ${NEC_1099_THRESHOLD}+ this year.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Select year" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button asChild>
          <a href={`${base}&format=zip`}>
            <FileArchive className="w-4 h-4 mr-2" />
            Download Pack (ZIP)
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={`${base}&format=forms-pdf`}>
            <FileText className="w-4 h-4 mr-2" />
            1099-NEC Forms (PDF)
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={`${base}&format=summary-pdf`}>
            <Download className="w-4 h-4 mr-2" />
            Summary (PDF)
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={`${base}&format=csv`}>
            <Download className="w-4 h-4 mr-2" />
            Summary (CSV)
          </a>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">1099-NEC required</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">{eligible.length}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Total reportable</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">${eligibleTotal.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Missing W-9</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums text-amber-600">{missingW9.length}</p>
        </div>
      </div>

      {missingW9.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            {missingW9.length} contractor{missingW9.length === 1 ? "" : "s"} need a 1099-NEC but{" "}
            {missingW9.length === 1 ? "has" : "have"} no W-9 on file. Collect and verify their TIN before filing.
          </p>
        </div>
      )}

      {/* Preview table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {year} Contractors with Payments
          </p>
        </div>
        {contractors.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No reportable contractor payments in {year}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contractor</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">TIN</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">W-9</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Box 1</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {contractors.map((c) => {
                  const isEligible = !c.exemptFrom1099 && c.ytdReportable >= NEC_1099_THRESHOLD;
                  const needsW9 = isEligible && c.w9Status !== "RECEIVED";
                  return (
                    <tr key={c.id} className="hover:bg-accent/20 transition-colors">
                      <td className="px-6 py-3.5 font-medium">
                        <Link href={`/contractors/${c.id}`} className="hover:text-primary transition-colors">
                          {c.legalName}
                        </Link>
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground tabular-nums">
                        {c.tinLast4 ? `••• ${c.tinLast4}` : "—"}
                      </td>
                      <td className="px-6 py-3.5">{c.w9Status === "RECEIVED" ? "Yes" : "No"}</td>
                      <td className="px-6 py-3.5 text-right font-semibold tabular-nums">${c.ytdReportable.toFixed(2)}</td>
                      <td className="px-6 py-3.5 text-center">
                        {c.exemptFrom1099 ? (
                          <Badge variant="outline">Exempt</Badge>
                        ) : isEligible ? (
                          needsW9 ? (
                            <Badge variant="secondary">W-9 missing</Badge>
                          ) : (
                            <Badge variant="default">Required</Badge>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">Below threshold</span>
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
