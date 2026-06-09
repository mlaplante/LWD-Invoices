import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/trpc/server";
import { ProposalSection } from "@/components/invoices/ProposalSection";
import { ProposalEngagementPanel } from "@/components/invoices/ProposalEngagementPanel";
import { SendInvoiceButton } from "@/components/invoices/SendInvoiceButton";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { Download, ExternalLink } from "lucide-react";

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const invoice = await api.invoices.get({ id }).catch(() => null);
  if (!invoice || invoice.type !== "ESTIMATE") notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{invoice.client.name}</p>
          <h1 className="text-2xl font-semibold">Proposal {invoice.number}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatCurrency(
              invoice.total,
              invoice.currency.symbol,
              invoice.currency.symbolPosition,
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Same send action the invoice page uses for estimates. */}
          <SendInvoiceButton invoiceId={invoice.id} clientId={invoice.client.id} />
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/api/invoices/${invoice.id}/proposal-pdf`}
              target="_blank"
              rel="noreferrer"
            >
              <Download className="mr-2 h-4 w-4" />
              PDF
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/invoices/${invoice.id}`}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open as estimate
            </Link>
          </Button>
        </div>
      </div>

      <ProposalSection invoiceId={invoice.id} />

      <ProposalEngagementPanel
        invoiceId={invoice.id}
        hasSent={invoice.lastSent != null}
        signedAt={invoice.signedAt}
      />
    </div>
  );
}
