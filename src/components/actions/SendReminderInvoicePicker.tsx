"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Command } from "cmdk";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CollectionsReminderDialog } from "@/components/reports/CollectionsReminderDialog";
import type { ActionPrimitiveProps } from "./QuickExpenseSheet";

export function SendReminderInvoicePicker({ open, onOpenChange, onCompleted }: ActionPrimitiveProps) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<{ id: string; number: string } | null>(null);
  const { data } = trpc.invoices.openForReminder.useQuery({ q: q || undefined }, { enabled: open });

  return (
    <>
      <Dialog open={open && !picked} onOpenChange={(o) => { if (!o) { setQ(""); onOpenChange(false); } }}>
        <DialogContent className="p-0 overflow-hidden max-w-lg">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>Send reminder — choose invoice</DialogTitle>
          </DialogHeader>
          <Command shouldFilter={false}>
            <Command.Input value={q} onValueChange={setQ} placeholder="Search open invoices…" className="h-11 w-full border-b px-4 text-sm outline-none bg-transparent" />
            <Command.List className="max-h-72 overflow-y-auto p-2">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No open invoices.</Command.Empty>
              {data?.map((inv) => (
                <Command.Item
                  key={inv.id}
                  value={inv.id}
                  onSelect={() => setPicked({ id: inv.id, number: inv.number })}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent"
                >
                  <span className="truncate">{inv.number} — {inv.clientName}</span>
                  <span className="text-xs text-muted-foreground capitalize">{inv.status.toLowerCase()}</span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>

      <CollectionsReminderDialog
        invoiceId={picked?.id ?? null}
        invoiceNumber={picked?.number}
        onClose={() => {
          setPicked(null);
          setQ("");
          onOpenChange(false);
          onCompleted?.();
        }}
      />
    </>
  );
}
