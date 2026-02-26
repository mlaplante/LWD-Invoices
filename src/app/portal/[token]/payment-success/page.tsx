import Link from "next/link";
import { db } from "@/server/db";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default async function PaymentSuccessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    select: { number: true, organization: { select: { name: true } } },
  });

  if (!invoice) notFound();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border/50 bg-card p-8 text-center">
        {/* Success icon */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2">Payment Received!</h1>
        <p className="text-muted-foreground mb-1">
          Thank you for your payment on invoice <strong>#{invoice.number}</strong>.
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          A receipt has been sent to your email address.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild>
            <a href={`/api/portal/${token}/pdf`} download>
              <Download className="w-4 h-4" />
              Download Receipt
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/portal/${token}`}>Back to Invoice</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
