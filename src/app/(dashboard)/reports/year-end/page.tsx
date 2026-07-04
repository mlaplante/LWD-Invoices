"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileText, Loader2, Receipt, CreditCard, Scale, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

const reports = [
  {
    id: "pl",
    label: "Profit & Loss",
    description: "Revenue, expenses, and net income summarized by month.",
    icon: FileText,
    color: "bg-blue-50 text-blue-600",
  },
  {
    id: "expenses",
    label: "Expense Ledger",
    description: "All expenses with category, supplier, and amounts.",
    icon: Receipt,
    color: "bg-violet-50 text-violet-600",
  },
  {
    id: "payments",
    label: "Payment Ledger",
    description: "Every payment received with gateway and invoice reference.",
    icon: CreditCard,
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    id: "tax",
    label: "Tax Liability",
    description: "Tax collected by type, ready for your accountant.",
    icon: Scale,
    color: "bg-orange-50 text-orange-600",
  },
  {
    id: "aging",
    label: "AR Aging Snapshot",
    description: "Outstanding receivables by aging bucket as of December 31.",
    icon: Gauge,
    color: "bg-fuchsia-50 text-fuchsia-600",
  },
];

const ZIP_POLL_INTERVAL_MS = 2000;
const ZIP_POLL_TIMEOUT_MS = 5 * 60 * 1000;

export default function YearEndExportPage() {
  const [year, setYear] = useState(String(currentYear));
  const [zipState, setZipState] = useState<"idle" | "preparing" | "failed">("idle");
  const zipRunning = useRef(false);

  // The full ZIP renders 5 PDFs and can outlive a serverless request on a big
  // org, so it runs as a background job: enqueue, poll, then download the
  // signed URL once the archive is ready.
  async function downloadZip() {
    if (zipRunning.current) return;
    zipRunning.current = true;
    setZipState("preparing");
    try {
      const res = await fetch("/api/reports/year-end/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: Number(year) }),
      });
      if (!res.ok) throw new Error("enqueue failed");
      const { jobId } = (await res.json()) as { jobId: string };

      const deadline = Date.now() + ZIP_POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, ZIP_POLL_INTERVAL_MS));
        const poll = await fetch(`/api/reports/year-end/jobs/${jobId}`);
        if (!poll.ok) continue;
        const body = (await poll.json()) as { status: string; url?: string };
        if (body.status === "ready" && body.url) {
          window.location.assign(body.url);
          setZipState("idle");
          return;
        }
        if (body.status === "failed") break;
      }
      setZipState("failed");
    } catch {
      setZipState("failed");
    } finally {
      zipRunning.current = false;
    }
  }

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
        <h1 className="text-2xl font-bold tracking-tight">Year-End Export</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Download P&L, expense, payment, and tax reports for your accountant.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Select year" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={downloadZip} disabled={zipState === "preparing"}>
          {zipState === "preparing" ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Preparing…
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Download All (ZIP)
            </>
          )}
        </Button>
        {zipState === "failed" && (
          <p className="text-sm text-destructive">
            Export failed.{" "}
            <a className="underline" href={`/api/reports/year-end?year=${year}&format=zip`}>
              Try the direct download
            </a>
            .
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {reports.map((r) => {
          const Icon = r.icon;
          return (
            <div
              key={r.id}
              className="rounded-2xl border border-border/50 bg-card p-5 space-y-3"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${r.color}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{r.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {r.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`/api/reports/year-end?year=${year}&format=csv&report=${r.id}`}
                  >
                    CSV
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`/api/reports/year-end?year=${year}&format=pdf&report=${r.id}`}
                  >
                    PDF
                  </a>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
