import { db } from "@/server/db";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default async function PaySuccessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    include: {
      organization: { select: { name: true, logoUrl: true } },
      currency: { select: { symbol: true, symbolPosition: true } },
    },
  });

  if (!invoice) notFound();

  const sym = invoice.currency.symbol;
  const symPos = invoice.currency.symbolPosition;
  const fmtAmount = (n: number) =>
    symPos === "before" ? `${sym}${n.toFixed(2)}` : `${n.toFixed(2)}${sym}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border/50 bg-card shadow-lg p-8 text-center">
        {invoice.organization.logoUrl && (
          <Image
            src={invoice.organization.logoUrl}
            alt={invoice.organization.name}
            width={48}
            height={48}
            className="rounded-lg object-contain mx-auto mb-4"
          />
        )}
        <div className="rounded-full bg-emerald-100 p-4 w-fit mx-auto mb-4">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold mb-1">Payment received</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Thank you for your payment of {fmtAmount(Number(invoice.total))} for
          Invoice #{invoice.number}.
        </p>
        <p className="text-xs text-muted-foreground">
          {invoice.organization.name} will send a receipt to your email.
        </p>
        <div className="mt-6">
          <Link
            href={`/portal/${token}`}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          >
            View invoice details
          </Link>
        </div>
      </div>
    </div>
  );
}
