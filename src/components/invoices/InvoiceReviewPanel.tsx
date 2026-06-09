"use client";

import { trpc } from "@/trpc/client";

const SEVERITY_STYLES: Record<string, string> = {
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-sky-300 bg-sky-50 text-sky-900",
};

export function InvoiceReviewPanel({ invoiceId }: { invoiceId: string }) {
  const review = trpc.invoiceReview.review.useMutation();

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        onClick={() => review.mutate({ invoiceId })}
        disabled={review.isPending}
      >
        {review.isPending ? "Reviewing…" : "AI review before send"}
      </button>

      {review.data && review.data.findings.length === 0 && (
        <p className="text-sm text-emerald-700">
          No issues found — this invoice looks ready to send.
        </p>
      )}

      {review.data && review.data.findings.length > 0 && (
        <ul className="space-y-2">
          {review.data.findings.map((f, i) => (
            <li
              key={`${f.code}-${i}`}
              className={`rounded-md border px-3 py-2 text-sm ${SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.info}`}
            >
              {f.message}
            </li>
          ))}
        </ul>
      )}

      {review.error && (
        <p className="text-sm text-red-600">
          Couldn&apos;t run the review. You can still send.
        </p>
      )}
    </div>
  );
}
