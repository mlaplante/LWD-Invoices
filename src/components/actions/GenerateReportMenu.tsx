"use client";

import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart3 } from "lucide-react";
import type { ActionPrimitiveProps } from "./QuickExpenseSheet";

// Routes verified against src/app/(dashboard)/reports/* directory:
// /reports, /reports/unpaid, /reports/expenses, /reports/aging, /reports/year-end
const REPORTS = [
  { label: "Revenue report", href: "/reports" },
  { label: "Unpaid invoices", href: "/reports/unpaid" },
  { label: "Expense ledger", href: "/reports/expenses" },
  { label: "AR aging", href: "/reports/aging" },
  { label: "Year-end pack", href: "/reports/year-end" },
];

export function GenerateReportMenu({ open, onOpenChange, onCompleted }: ActionPrimitiveProps) {
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden max-w-md">
        <DialogHeader className="px-4 pt-4"><DialogTitle>Generate report</DialogTitle></DialogHeader>
        <Command>
          <Command.List className="max-h-72 overflow-y-auto p-2">
            {REPORTS.map((r) => (
              <Command.Item key={r.href} value={r.label} onSelect={() => { onOpenChange(false); onCompleted?.(); router.push(r.href); }} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />{r.label}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
