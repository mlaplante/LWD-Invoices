"use client";

import { trpc } from "@/trpc/client";

const SEVERITY_STYLES: Record<string, string> = {
  warning: "border-warning/30 bg-warning/12 text-warning-foreground",
  info: "border-primary/30 bg-accent text-accent-foreground",
};

export function InvoiceReviewPanel({ invoiceId }: { invoiceId: string }) {
  const review = trpc.invoiceReview.review.useMutation();

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        onClick={() => review.mutate({ invoiceId })}
        disabled={review.isPending}
      >
        {review.isPending ? "Reviewing…" : "AI review before send"}
      </button>

      {review.data && review.data.findings.length === 0 && (
        <p className="text-sm text-success-foreground">
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
        <p className="text-sm text-danger-foreground">
          Couldn&apos;t run the review. You can still send.
        </p>
      )}
    </div>
  );
}
