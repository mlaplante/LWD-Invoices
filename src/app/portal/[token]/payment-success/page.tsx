import Link from "next/link";
import { db } from "@/server/db";
import { notFound } from "next/navigation";

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border bg-white shadow-sm p-8 text-center">
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

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Received!</h1>
        <p className="text-gray-500 mb-1">
          Thank you for your payment on invoice <strong>#{invoice.number}</strong>.
        </p>
        <p className="text-sm text-gray-400 mb-8">
          {invoice.organization.name} will send you a receipt by email.
        </p>

        <Link
          href={`/portal/${token}`}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Back to Invoice
        </Link>
      </div>
    </div>
  );
}
