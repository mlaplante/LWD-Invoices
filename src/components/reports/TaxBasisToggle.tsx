"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type Props = {
  basis: "cash" | "accrual";
};

export function TaxBasisToggle({ basis }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const toggle = useCallback(
    (newBasis: "cash" | "accrual") => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("basis", newBasis);
      router.replace(`/reports/tax-liability?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-card p-0.5">
      <button
        type="button"
        onClick={() => toggle("accrual")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          basis === "accrual"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Accrual
      </button>
      <button
        type="button"
        onClick={() => toggle("cash")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          basis === "cash"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Cash
      </button>
    </div>
  );
}
