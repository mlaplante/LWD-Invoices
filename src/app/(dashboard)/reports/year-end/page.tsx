"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileText, Receipt, CreditCard, Scale } from "lucide-react";
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
];

export default function YearEndExportPage() {
  const [year, setYear] = useState(String(currentYear));

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

        <Button asChild>
          <a href={`/api/reports/year-end?year=${year}&format=zip`}>
            <Download className="w-4 h-4 mr-2" />
            Download All (ZIP)
          </a>
        </Button>
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
