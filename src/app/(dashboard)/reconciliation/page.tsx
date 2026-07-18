import { UnmatchedPaymentsList } from "@/components/reconciliation/UnmatchedPaymentsList";

export const metadata = { title: "Reconciliation" };

export default function ReconciliationPage() {
  return <div className="space-y-5"><div><h1 className="text-2xl font-bold tracking-tight">Reconciliation</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Record payments received outside the payment platform and match them to open invoices.</p></div><UnmatchedPaymentsList /></div>;
}
