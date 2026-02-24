import { api } from "@/trpc/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ClientForm } from "@/components/clients/ClientForm";
import type { InvoiceStatus } from "@/generated/prisma";

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SENT: "bg-blue-100 text-blue-700",
  PARTIALLY_PAID: "bg-yellow-100 text-yellow-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
};

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let client;
  try {
    client = await api.clients.get({ id });
  } catch {
    notFound();
  }

  const invoices = await api.invoices.list({ clientId: id, includeArchived: false });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const portalLink = `${appUrl}/portal/${client.portalToken}`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/clients" className="text-sm text-muted-foreground hover:underline">
            ← Clients
          </Link>
          <h1 className="text-2xl font-bold">{client.name}</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/invoices/new?clientId=${client.id}`}>New Invoice</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={portalLink} target="_blank" rel="noreferrer">
              Portal ↗
            </a>
          </Button>
        </div>
      </div>

      {/* Edit form */}
      <div className="rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Client Details</h2>
        <ClientForm mode="edit" client={client} />
      </div>

      {/* Invoices */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Invoices</h2>
        {invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            No invoices for this client yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Number</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Due</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium">
                      <Link href={`/invoices/${inv.id}`} className="hover:underline">
                        #{inv.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status]}`}
                      >
                        {inv.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(inv.date)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(inv.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {inv.currency.symbol}{Number(inv.total).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
