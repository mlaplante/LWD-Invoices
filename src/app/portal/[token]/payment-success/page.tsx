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
          A receipt has been sent to your email address.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={`/api/portal/${token}/pdf`}
            download
            className="inline-flex items-center justify-center gap-2 rounded-md bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Receipt
          </a>
          <Link
            href={`/portal/${token}`}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Back to Invoice
          </Link>
        </div>
      </div>
    </div>
  );
}
