"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function InvoiceDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <div className="rounded-2xl border border-border/60 bg-card px-6 py-7 shadow-sm">
        <h2 className="font-display text-3xl">Failed to load invoice</h2>
        <p role="alert" className="mt-2 max-w-md text-sm text-muted-foreground">
          {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/invoices">Back to invoices</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
