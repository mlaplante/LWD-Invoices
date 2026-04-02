"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RecordPaymentDialog } from "@/components/invoices/RecordPaymentDialog";
import { ResendInvoiceButton } from "@/components/invoices/ResendInvoiceButton";
import type { InvoiceStatus, InvoiceType } from "@/generated/prisma";

type Props = {
  invoiceId: string;
  invoiceTotal: number;
  status: InvoiceStatus;
  invoiceType: InvoiceType;
};

const PAYABLE: InvoiceStatus[] = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

export function InvoiceRowActions({ invoiceId, invoiceTotal, status, invoiceType }: Props) {
  const [payOpen, setPayOpen] = useState(false);
  const router = useRouter();
  const isPayable = PAYABLE.includes(status);

  return (
    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <Link
        href={`/invoices/${invoiceId}`}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
      >
        View
      </Link>
      {isPayable && invoiceType !== "ESTIMATE" && (
        <button
          onClick={() => setPayOpen(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors"
        >
          Mark Paid
        </button>
      )}
      {(status === "SENT" || status === "OVERDUE" || status === "PARTIALLY_PAID") && invoiceType !== "ESTIMATE" && (
        <ResendInvoiceButton invoiceId={invoiceId} />
      )}
      <RecordPaymentDialog
        invoiceId={invoiceId}
        invoiceTotal={invoiceTotal}
        open={payOpen}
        onOpenChange={setPayOpen}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
